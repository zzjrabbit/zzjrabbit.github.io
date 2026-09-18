import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { extractNote, leanSourceFor, normaliseTags, parseSiteMetadata } from '../scripts/prepare-starlight.mjs';

test('links only exact companion Lean files for Typst notes', () => {
  const files = new Set(['lean/topology/continuous.lean', 'lean/Main.lean', 'lean/real/a b.lean', 'lean/mechanics/kepler.lean']);
  assert.equal(leanSourceFor('typ/topology/continuous.html', files), 'https://github.com/zzjrabbit/notes/blob/main/lean/topology/continuous.lean');
  assert.equal(leanSourceFor('typ/real/continuous.html', files), null);
  assert.equal(leanSourceFor('typ/topology/missing.html', files), null);
  assert.equal(leanSourceFor('models/topology/continuous.html', files), null);
  assert.equal(leanSourceFor('typ/topology/continuous.pdf', files), null);
  assert.equal(leanSourceFor('typ/real/a b.html', files), 'https://github.com/zzjrabbit/notes/blob/main/lean/real/a%20b.lean');
  assert.equal(leanSourceFor('typ/topology/continuous.html', new Set()), null);
  // A physics note mirrors into lean/ exactly as a mathematics note does.
  assert.equal(leanSourceFor('phys/mechanics/kepler.html', files), 'https://github.com/zzjrabbit/notes/blob/main/lean/mechanics/kepler.lean');
  assert.equal(leanSourceFor('phys/mechanics/missing.html', files), null);
  assert.equal(leanSourceFor('essays/on-proof.html', files), null);
});

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
test('diagram ink follows the theme without inverting semantic colors or masks', () => {
  const note = extractNote(`<main class="calepin-website-main"><h1>Diagram</h1>
    <svg viewBox="0 0 20 20"><defs><path id="glyph" d="M0 0h2"/><mask id="cutout"><path fill="#000000"/></mask></defs>
    <use href="#glyph" fill="#000000"/><path stroke="#000" fill="none"/>
    <text fill="black">Label</text><path fill="#ff0000" stroke="#0055ff"/>
    <path fill="rgb(0, 0, 0)"/><path fill="#ffffff"/></svg>
    <img src="photo.png" alt="Unchanged photo">
  </main>`, 'diagram.html');
  const $ = load(note.html);
  assert.ok($('svg').hasClass('note-diagram'));
  assert.ok($('svg').hasClass('not-content'));
  assert.equal($('use').attr('fill'), 'currentColor');
  assert.equal($('use').attr('href'), '#glyph');
  assert.equal($('path[stroke="currentColor"]').attr('fill'), 'none');
  assert.equal($('text').attr('fill'), 'currentColor');
  assert.equal($('path[fill="#ff0000"]').attr('stroke'), '#0055ff');
  assert.equal($('mask path').attr('fill'), '#000000');
  assert.equal($('path[fill="#ffffff"]').length, 1);
  assert.equal($('path[fill="currentColor"]').length, 1);
  assert.equal($('#glyph').attr('fill'), undefined);
  assert.equal($('img').attr('src'), 'photo.png');
});

test('fails explicitly on missing article or heading', () => {
  assert.throws(() => extractNote('<main></main>', 'bad.html'), /one Calepin article/);
  assert.throws(() => extractNote('<main class="calepin-website-main"></main>', 'bad.html'), /missing title/);
});

test('reads the site metadata a note declares, independently of Calepin internals', () => {
  const source = `#import "../shared.typ": *
#import "@preview/noteworthy:0.4.0": *
#import "/themes/site/notes.typ": *

#show: tylenotes.with(
  title: "Continuity (on subsets)",
  date: "2026-08-11",
  tags: ("topology", "lean"),
  summary: "Preimages of open sets, with \\"quotes\\" and (parentheses).",
)

#theorem(title: "continuity")[
  Let $A subset RR$ and let f : A -> RR.
  #metadata((tags: ("not-the-site-metadata",)))
]
`;
  assert.deepEqual(parseSiteMetadata(source), {
    title: 'Continuity (on subsets)',
    date: '2026-08-11',
    tags: ['topology', 'lean'],
    summary: 'Preimages of open sets, with "quotes" and (parentheses).',
  });
  assert.deepEqual(parseSiteMetadata('#show: tylenotes.with(title: "T", date: "2026-01-01", tags: ("x"))'), { title: 'T', date: '2026-01-01', tags: ['x'] });
  // Computed values are skipped rather than guessed at.
  assert.deepEqual(parseSiteMetadata('#show: tylenotes.with(title: "T", date: when, tags: my-tags)'), { title: 'T' });
  assert.deepEqual(parseSiteMetadata('#show: noteworthy.with(title: "T")'), {});
  assert.deepEqual(parseSiteMetadata(''), {});
  assert.deepEqual(normaliseTags('model'), ['model']);
  assert.deepEqual(normaliseTags(['a', '', 7]), ['a']);
  assert.deepEqual(normaliseTags(undefined), []);
});
