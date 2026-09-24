import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('sync removes deleted collections and adapts copies idempotently', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'notes-sync-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'source/typ'), { recursive: true });
    await mkdir(path.join(root, 'site/models'), { recursive: true });
    await writeFile(path.join(root, 'site/models/stale.typ'), 'stale');
    const source = '#import "@preview/noteworthy:0.4.0": *\nHello\n';
    await writeFile(path.join(root, 'source/typ/test.typ'), source);
    await cp('scripts/sync-notes.sh', path.join(root, 'scripts/sync-notes.sh'));
    const run = () => execFileSync('bash', [path.join(root, 'scripts/sync-notes.sh')], {
      env: { ...process.env, NOTES_DIR: path.join(root, 'source') },
    });
    run();
    await assert.rejects(access(path.join(root, 'site/models')));
    const first = await readFile(path.join(root, 'site/typ/test.typ'), 'utf8');
    assert.equal(first.split('#import "/themes/site/notes.typ": *').length, 2);
    run();
    assert.equal(await readFile(path.join(root, 'site/typ/test.typ'), 'utf8'), first);
    assert.equal(await readFile(path.join(root, 'source/typ/test.typ'), 'utf8'), source);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/** A synchronized-copy fixture: the real adapter, a notes source, one runner. */
async function syncFixture(prefix, files) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'site/themes/site'), { recursive: true });
  await cp('scripts/sync-notes.sh', path.join(root, 'scripts/sync-notes.sh'));
  await cp('site/themes/site/cetz.typ', path.join(root, 'site/themes/site/cetz.typ'));
  const adapter = await readFile('site/themes/site/cetz.typ', 'utf8');
  const pin = /^#import "@preview\/cetz:([^"]+)"/m.exec(adapter)[1];
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, 'source', name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text.replaceAll('<CETZ>', pin));
  }
  return {
    root,
    pin,
    run: () => execFileSync('bash', [path.join(root, 'scripts/sync-notes.sh')], {
      env: { ...process.env, NOTES_DIR: path.join(root, 'source') }, stdio: 'pipe', encoding: 'utf8',
    }),
    copy: name => readFile(path.join(root, 'site', name), 'utf8'),
  };
}

test('sync points every CeTZ import form at the site adapter', async () => {
  // The path is rewritten rather than the statement, which is what makes bare,
  // aliased, selective, multi-line and library imports all reach
  // themes/site/cetz.typ — and what keeps `cetz.canvas(...)` working, because a
  // bare path import binds the file stem `cetz`, as the package import did.
  const fixture = await syncFixture('notes-sync-cetz-', {
    'typ/bare.typ': '#import "@preview/cetz:<CETZ>"\n#cetz.canvas({})\n',
    'typ/aliased.typ': '#import "@preview/cetz:<CETZ>" as cez\n#cez.canvas({})\n',
    'typ/selective.typ': '#import "@preview/cetz:<CETZ>": canvas, draw\n',
    'typ/glob.typ': '#import "@preview/cetz:<CETZ>": *\n',
    'typ/multiline.typ': '#import "@preview/cetz:<CETZ>":\n  canvas,\n  draw\n',
    'typ/shared.typ': '#import "@preview/cetz:<CETZ>": draw\n// A collection library draws too, so it needs the adapter as well.\n',
  });
  try {
    fixture.run();
    assert.match(await fixture.copy('typ/bare.typ'), /^#import "\/themes\/site\/cetz\.typ"\n#cetz\.canvas\(\{\}\)\n/);
    assert.match(await fixture.copy('typ/aliased.typ'), /^#import "\/themes\/site\/cetz\.typ" as cez\n#cez\.canvas/);
    assert.match(await fixture.copy('typ/selective.typ'), /^#import "\/themes\/site\/cetz\.typ": canvas, draw\n/);
    assert.match(await fixture.copy('typ/glob.typ'), /^#import "\/themes\/site\/cetz\.typ": \*\n/);
    assert.match(await fixture.copy('typ/multiline.typ'), /^#import "\/themes\/site\/cetz\.typ":\n {2}canvas,\n {2}draw\n/);
    assert.match(await fixture.copy('typ/shared.typ'), /^#import "\/themes\/site\/cetz\.typ": draw\n/);
    for (const name of ['typ/bare.typ', 'typ/aliased.typ', 'typ/selective.typ', 'typ/glob.typ', 'typ/multiline.typ', 'typ/shared.typ']) {
      assert.ok(!(await fixture.copy(name)).includes('@preview/cetz:'), `${name}: the package import must not survive`);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test('sync stops when a note asks for a CeTZ version the adapter does not pin', async () => {
  // The copies are compiled against the adapter's pin, so a note that moved on
  // would silently be built with the version it did not ask for. Nothing is
  // rewritten in that case: the build stops before touching the tree.
  const fixture = await syncFixture('notes-sync-cetz-pin-', {
    'typ/note.typ': '#import "@preview/cetz:1.2.3": canvas\n',
  });
  try {
    let error;
    try { fixture.run(); } catch (thrown) { error = thrown; }
    assert.ok(error, 'a CeTZ version the adapter does not pin must stop the synchronizer');
    assert.match(String(error.stderr), /cetz:1\.2\.3/);
    assert.match(String(error.stderr), new RegExp(`cetz:${fixture.pin.replaceAll('.', '\\.')}`));
    assert.match(await fixture.copy('typ/note.typ'), /@preview\/cetz:1\.2\.3/, 'a mismatched version is not rewritten');
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});
