import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { extractNote } from '../scripts/prepare-starlight.mjs';

test('retains mathematics, SVG, old anchors and relative links without Markdown parsing', () => {
  const note = extractNote(`<html><head><style>math { math-style: normal; }</style><meta name="description" content="测试 &amp; 描述"></head><body><main class="calepin-website-main"><h1 id="old-title">测试标题</h1><h2 id="existing">定义</h2><h3>证明</h3><section class="note-environment"><math><mi>x</mi><mo>&lt;</mo><mn>2</mn></math><svg viewBox="0 0 10 10"><path d="M0 0"/></svg><a href="../other.html#result">{not MDX}</a></section></main><script id="calepin-website-source-data" type="application/json">"#let x = 2"</script></body></html>`, 'typ/test.html');
  const $ = load(note.html);
  assert.equal(note.title, '测试标题');
  assert.equal(note.description, '测试 & 描述');
  assert.equal($('h1').length, 0);
  assert.equal($('#old-title').length, 1);
  assert.equal($('math').text(), 'x<2');
  assert.ok($('math').hasClass('not-content'));
  assert.equal(note.mathCSS, 'math { math-style: normal; }');
  assert.equal($('svg').attr('viewBox'), '0 0 10 10');
  assert.equal($('a').attr('href'), '../other.html#result');
  assert.deepEqual(note.headings.map(h => h.slug), ['existing', 'section-2']);
  assert.equal(note.source, '#let x = 2');
});
test('fails explicitly on missing article or heading', () => {
  assert.throws(() => extractNote('<main></main>', 'bad.html'), /one Calepin article/);
  assert.throws(() => extractNote('<main class="calepin-website-main"></main>', 'bad.html'), /missing title/);
});
