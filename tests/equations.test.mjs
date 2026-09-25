import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Equation numbering on the website.
 *
 * Typst's HTML export silently drops the number of a numbered equation: no
 * warning, no `(1)` on the page, while `@eq:` references keep resolving. Both
 * halves of the site's answer work by convention and fail quietly — a number that
 * never appears, a formula that vanishes — so they are asserted here. `equations`
 * is the numbering a note turns on for itself, `web-equations` is the hook
 * `scripts/sync-notes.sh` gives every synchronized copy, and the last two tests
 * compile Typst for real.
 */
const NOTES = 'site/themes/site/notes.typ';
// The synchronized copy of the notes repository's shared library, which is where
// the numbering is defined. It exists after `scripts/sync-notes.sh` has run —
// which the build does before anything else — and is not tracked here.
const SHARED = 'site/typ/shared.typ';
const STYLES = 'src/styles/notes.css';
const SYNC = 'scripts/sync-notes.sh';
const run = promisify(execFile);

const typst = await run('typst', ['--version']).then(() => true, () => false);

/** Compile a probe inside `site/`, whose `/themes/site/...` imports need the root. */
async function compile(source, { html = true } = {}) {
  const dir = 'site/.equations-test';
  const file = `${dir}/probe.typ`;
  const out = `${dir}/probe.${html ? 'html' : 'pdf'}`;
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(file, source);
    const args = ['compile', '--root', 'site'];
    if (html) args.push('--features', 'html', '--input', 'calepin-target=html');
    args.push(file, out);
    await run('typst', args);
    return await readFile(out, 'utf8').catch(() => '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the site numbers equations in both outputs, not just the PDF', async () => {
  // The numbering itself lives in the notes repository, next to `tylenotes`, so
  // that `site/typ/shared.typ` — the copy every note imports, on its own or
  // published — carries it. The theme only re-exports it.
  const shared = await readFile(SHARED, 'utf8');
  assert.match(shared, /^#let equations\(numbering: "\(1\)", number-align: right, body\) = \{/m,
    'shared.typ must expose `equations`, the numbering a note turns on with `#show: equations`');
  // Paged output must keep Typst's native numbering: the replacement happens
  // inside the show rule, on the web branch only. An early `return body` would
  // drop the `set` rule with it and leave the PDF unnumbered.
  assert.match(shared, /if is-web\(\) and it\.numbering == numbering \{ _site-note-equation\(it\) \} else \{ it \}/,
    'only the web branch may replace the equation element');
  assert.match(shared, /show ref: _site-equation-ref/,
    'references must print the bare number the note asked for, in both outputs');
  assert.match(shared, /html\.elem\("div", attrs: \(class: "note-equation note-equation-" \+ edge\)/,
    'HTML must carry the number in a wrapper rather than in the formula');

  const notes = await readFile(NOTES, 'utf8');
  assert.match(notes, /^#import "\/typ\/shared\.typ": equations, web-equations$/m,
    'the theme must take the numbering from the notes repository rather than keep its own copy');
  assert.doesNotMatch(notes, /#let equations\(/,
    'a second definition in the theme is what let the two drift apart');
  assert.doesNotMatch(notes, /_site-note-equation/,
    'the theme is not where the number is built any more');
});

test('the web fallback leaves environment numbering alone', async () => {
  const shared = await readFile(SHARED, 'utf8');
  assert.match(shared, /^#let web-equations\(body\) = \{\n  if not is-web\(\) \{ return body \}/m,
    'web-equations must not touch paged output');
  // `theoretic` marks the equation ending a proof by replacing its numbering
  // with a function that draws the QED box and steps the counter back.
  assert.match(shared, /if not it\.block or type\(it\.numbering\) != str \{ return it \}/,
    'a non-counting numbering belongs to the environment that set it');
  assert.match(shared, /if _site-equations\.get\(\) \{ return it \}/,
    'web-equations must stand down while `equations` is in charge');
  assert.match(shared, /_site-equations\.update\(true\)/,
    '`equations` must announce itself to web-equations');
});

test('the synchronizer delivers the hook and nothing else', async () => {
  const sync = await readFile(SYNC, 'utf8');
  assert.match(sync, /#show: web-equations\\n/,
    'every synchronized copy needs the equation hook, next to the notes.typ import');
  // A collection `shared.typ` defines that hook itself now, so injecting the
  // adapter import into it would close a cycle: the theme imports `shared.typ`,
  // which would import the theme back.
  assert.match(sync, /\[\[ "\$\(basename "\$file"\)" == shared\.typ \]\] && continue/,
    'the synchronizer must leave each collection library alone');
  // `equate` used to be rewritten to an adapter here. The notes moved to
  // `#show: equations`, so the rewrite and its adapter are gone; a stray
  // reference to either would be a half-finished removal.
  assert.doesNotMatch(sync, /equate/i, 'scripts/sync-notes.sh must no longer mention equate');
  await assert.rejects(access('site/themes/site/equate.typ'),
    'the equate adapter must be gone once the notes stop using the package');
  assert.match(sync, /cetz/, 'the CeTZ rewrite must survive the equate removal');
});

test('every class the equation adapter emits is styled', async () => {
  const styles = await readFile(STYLES, 'utf8');
  for (const name of ['note-equation', 'note-equation-body', 'note-equation-number', 'note-equation-start']) {
    assert.ok(styles.includes(`.${name}`), `${name} is emitted by the adapter but styled nowhere in ${STYLES}`);
  }
  // The two boxes are placed by CSS: `align`, `grid` and `place` are all ignored
  // — and emptied — during HTML export.
  assert.match(styles, /\.note-equation \{ display: flex;/,
    'the number cannot be positioned by a Typst layout element');
});

test('typst numbers an equation and links it, in both outputs', { skip: !typst }, async () => {
  // The imports mirror a synchronized note: the shared library first, then the
  // theme the synchronizer injects. Going through the shared library is also what
  // catches a cycle between the two — the theme imports it, so it must not import
  // the theme back.
  const source = [
    '#import "/typ/shared.typ": *',
    '#import "/themes/site/notes.typ": *',
    '#show: web-equations',
    '#show: equations',
    '',
    '$ E = m c^2 $ <eq:energy>',
    '',
    'See @eq:energy.',
  ].join('\n');

  const html = await compile(source);
  assert.match(html, /class="note-equation note-equation-end"/, 'the formula must be numbered on the web');
  assert.match(html, /note-equation-number">\(1\)</, 'the number itself must be there');
  assert.match(html, /href="#loc-1">\(1\)</, 'the reference must print that same number');
  assert.match(html, /<math display="block">/, 'the formula itself must survive');

  // The PDF branch must compile too: `html.elem` does not exist in paged output,
  // so any adapter code reached there would fail loudly — which is the point.
  await compile(source, { html: false });
});

test('a note that only sets a numbering is numbered by the hook', { skip: !typst }, async () => {
  const source = [
    '#import "/typ/shared.typ": *',
    '#import "/themes/site/notes.typ": *',
    '#show: web-equations',
    '#set math.equation(numbering: "(1)")',
    '',
    '$ E = m c^2 $ <eq:energy>',
    '',
    'See @eq:energy.',
  ].join('\n');

  const html = await compile(source);
  assert.match(html, /<math display="block">/, 'the formula itself must survive');
  assert.match(html, /note-equation-number">\(1\)</, 'the hook must number what the note set');
  // This path keeps Typst's own reference wording, supplement included, rather
  // than the bare number `equations` prints. Paged output is identical, so a note
  // is the same in both outputs either way — and Typst separates the supplement
  // from the number with a non-breaking space, not a plain one.
  assert.match(html, /href="#loc-1">Equation\u00a01</, "references stay Typst's own, as in paged output");
});
