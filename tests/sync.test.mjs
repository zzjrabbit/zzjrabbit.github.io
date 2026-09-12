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
