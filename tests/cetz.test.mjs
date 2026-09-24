import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

/**
 * The two website-only Typst adapters.
 *
 * `cetz.typ` has to intercept a canvas where it is *called*, and `notes.typ`
 * replaces vocabulary the notes use (`align`, the theorem environments). Both
 * only work while a few naming and export details hold, and every one of them
 * fails at build time in a way that is hard to trace back, so they are asserted
 * here instead.
 */
const ADAPTER = 'site/themes/site/cetz.typ';
const NOTES = 'site/themes/site/notes.typ';
const STYLES = 'src/styles/notes.css';
const SYNC = 'scripts/sync-notes.sh';

test('the synchronizer and the adapter agree on the module path', async () => {
  const sync = await readFile(SYNC, 'utf8');
  const shim = /^\s*cetz_shim="([^"]+)"/m.exec(sync)?.[1];
  assert.ok(shim, 'scripts/sync-notes.sh must keep the rewritten CeTZ path in cetz_shim');
  await access(`site${shim}`).catch(() => {
    throw new Error(`cetz_shim points at site${shim}, which does not exist`);
  });
  // A bare import binds the file stem, and that stem is how `cetz.canvas(...)`
  // and `import cetz.draw: *` keep resolving after the path is rewritten.
  assert.equal(shim.split('/').pop(), ADAPTER.split('/').pop(), 'the rewritten path must keep the adapter file name');
});

test('the CeTZ adapter re-exports the package and shadows only canvas', async () => {
  const adapter = await readFile(ADAPTER, 'utf8');
  const versions = [...adapter.matchAll(/^#import "@preview\/cetz:([^"]+)"/gm)].map(match => match[1]);
  assert.equal(versions.length, 2, 'the adapter imports CeTZ twice: once for the original canvas, once to re-export it');
  assert.equal(new Set(versions).size, 1, 'both CeTZ imports must be the pinned version');

  // A glob re-export is what keeps `draw`, `decorations`, `coordinate`, ... and
  // any name a future CeTZ adds available under every import form.
  const glob = adapter.indexOf(`#import "@preview/cetz:${versions[0]}": *`);
  assert.notEqual(glob, -1, 'the adapter must re-export CeTZ with a glob import, not a hand-written list');
  const shadow = adapter.indexOf('#let canvas(');
  assert.ok(shadow > glob, 'the adapter canvas must be defined after the glob import it shadows');
  assert.match(adapter.slice(glob), /cetz-original\.canvas\(/, 'the adapter canvas must call the package canvas');
  assert.match(adapter, /html\.frame\(figure\)/, 'HTML export needs html.frame to keep the canvas as SVG');
  assert.match(adapter, /if not web \{ return figure \}/, 'paged output must get the untouched CeTZ canvas');
});

test('the align adapter keeps the content Typst drops in HTML', async () => {
  const notes = await readFile(NOTES, 'utf8');
  // `align` is an element function; the adapter captures it before shadowing.
  assert.match(notes, /^#let _align = align$/m, 'the adapter must capture the original align');
  assert.match(notes, /#let align\(alignment, body\) = \{/, 'align takes exactly the two call arguments Typst accepts');
  assert.match(notes, /return _align\(alignment, body\)/, 'paged output must use the original align');
  assert.match(notes, /html\.elem\("div", attrs: \(class: class\), body\)/, 'HTML must emit the content instead of losing it');
});

test('every class the adapters emit is styled by the stylesheet', async () => {
  const [adapter, notes, styles] = await Promise.all([
    readFile(ADAPTER, 'utf8'), readFile(NOTES, 'utf8'), readFile(STYLES, 'utf8'),
  ]);
  // Only literal class strings can be checked here: `"note-environment note-" + it.variant`
  // builds its name at run time and is out of reach of this test.
  const emitted = new Set(
    [...`${adapter}\n${notes}`.matchAll(/"((?:note|is)-[a-z-]+(?:\s+(?:is|note)-[a-z-]+)*)"/g)]
      .flatMap(match => match[1].split(/\s+/)),
  );
  assert.ok(emitted.has('note-diagram-block'), 'the adapter must still mark the block canvas wrapper');
  assert.ok(emitted.has('note-align-center'), 'the adapter must still mark centred content');
  for (const name of emitted) {
    assert.ok(styles.includes(`.${name}`), `${name} is emitted by an adapter but styled nowhere in ${STYLES}`);
  }
});
