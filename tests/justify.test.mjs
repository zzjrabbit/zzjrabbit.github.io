import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('note pages opt into the local progressive line breaker', async () => {
  const [page, script, css] = await Promise.all([
    readFile('src/pages/[...note].astro', 'utf8'),
    readFile('src/scripts/justify-notes.js', 'utf8'),
    readFile('src/styles/notes.css', 'utf8'),
  ]);
  assert.match(page, /import '\.\.\/scripts\/justify-notes\.js'/);
  assert.match(script, /mjx-break/);
  assert.match(script, /kp-math-glue/);
  assert.match(script, /kpSource/);
  assert.match(script, /beforeprint/);
  assert.match(script, /ResizeObserver/);
  assert.match(script, /range\.getBoundingClientRect\(\)\.width/, 'a range is measured once, including MathJax spacing margins');
  assert.doesNotMatch(script, /range\.getClientRects\(\)/, 'CHTML glyph rects must not be summed: each one is reported twice');
  assert.match(script, /width - safety, Infinity/, 'a section falls back to relaxed stretching before giving up');
  assert.doesNotMatch(script, /Typeset\.|window\.MathJax|from ['"]mathjax/,
    'the browser enhancement stays independent of a MathJax runtime');
  assert.match(css, /\.typst-article \.kp-line/);
  assert.match(css, /\.typst-article \.kp-math-glue/);
});
