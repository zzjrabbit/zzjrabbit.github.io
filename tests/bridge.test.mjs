import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { extractNote, leanSourceFor, normaliseTags, parseSiteMetadata } from '../scripts/prepare-starlight.mjs';

test('links only exact companion Lean files for Typst notes', () => {
  const files = new Set(['lean/topology/continuous.lean', 'lean/Main.lean', 'lean/real/a b.lean']);
  assert.equal(leanSourceFor('typ/topology/continuous.html', files), 'https://github.com/zzjrabbit/notes/blob/main/lean/topology/continuous.lean');
  assert.equal(leanSourceFor('typ/real/continuous.html', files), null);
  assert.equal(leanSourceFor('typ/topology/missing.html', files), null);
  assert.equal(leanSourceFor('models/topology/continuous.html', files), null);
  assert.equal(leanSourceFor('typ/topology/continuous.pdf', files), null);
  assert.equal(leanSourceFor('typ/real/a b.html', files), 'https://github.com/zzjrabbit/notes/blob/main/lean/real/a%20b.lean');
  assert.equal(leanSourceFor('typ/topology/continuous.html', new Set()), null);
  // Only mathematics notes are formalized: phys/ and models/ notes link no Lean
  // source, even when a file of that name happens to exist under lean/.
  assert.equal(leanSourceFor('phys/mechanics/kepler.html', new Set([...files, 'lean/mechanics/kepler.lean'])), null);
  assert.equal(leanSourceFor('physics/optics/lens.html', new Set([...files, 'lean/optics/lens.lean'])), null);
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
  // Diagrams are namespaced per page, see the test below.
  assert.equal($('use').attr('href'), '#note-diagram-1-glyph');
  assert.equal($('path[stroke="currentColor"]').attr('fill'), 'none');
  assert.equal($('text').attr('fill'), 'currentColor');
  assert.equal($('path[fill="#ff0000"]').attr('stroke'), '#0055ff');
  assert.equal($('mask path').attr('fill'), '#000000');
  assert.equal($('path[fill="#ffffff"]').length, 1);
  assert.equal($('path[fill="currentColor"]').length, 1);
  assert.equal($('#note-diagram-1-glyph').attr('fill'), undefined);
  assert.equal($('img').attr('src'), 'photo.png');
});

test('every diagram on a page keeps unique ids for its own symbols', () => {
  // Typst names a glyph symbol after a hash of the glyph, so two diagrams that
  // draw the same letter define the same id. The second diagram's <use> would
  // resolve into the first one's <symbol>, and the page would carry duplicate ids.
  const note = extractNote(`<main class="calepin-website-main"><h1>Two diagrams</h1>
    <svg viewBox="0 0 10 10"><defs><symbol id="g1A"><path d="M0 0h1"/></symbol></defs>
      <use xlink:href="#g1A"/><g clip-path="url(#g1A)"/></svg>
    <p>Between them</p>
    <svg viewBox="0 0 10 10"><defs><symbol id="g1A"><path d="M0 0h1"/></symbol></defs>
      <use xlink:href="#g1A"/><path fill="url(#g1A)"/></svg>
  </main>`, 'two.html');
  const $ = load(note.html);
  assert.deepEqual($('svg [id]').toArray().map(el => $(el).attr('id')), ['note-diagram-1-g1A', 'note-diagram-2-g1A']);
  // xlink:href is namespace-adjusted to `href` while parsing and written back as
  // `xlink:href`, so compare the serialized page, which is what ships.
  assert.deepEqual([...note.html.matchAll(/<use [^>]*href="#([^"]+)"/g)].map(match => match[1]),
    ['note-diagram-1-g1A', 'note-diagram-2-g1A']);
  assert.equal($('svg').eq(0).find('g').attr('clip-path'), 'url(#note-diagram-1-g1A)');
  assert.equal($('svg').eq(1).find('path[fill]').attr('fill'), 'url(#note-diagram-2-g1A)');
});

test('marks prime superscripts, and only prime superscripts, for the stylesheet', () => {
  const note = extractNote(`<main class="calepin-website-main"><h1>Primes</h1>
    <p>Let <math><msup><mi>f</mi><mo>\u2032</mo></msup></math> and <math><msup><mi>c</mi><mo>\u2032\u2032</mo></msup></math>.</p>
    <p><math><msubsup><mi>f</mi><mi>x</mi><mo>\u2032</mo></msubsup></math> and <math><msup><mi>f</mi><mo>\u2032</mo></msup><msub><mi>x</mi><mn>0</mn></msub></math></p>
    <math display="block"><msup><mi>H</mi><mo>\u2032</mo></msup><mrow><mo>(</mo><mi>a</mi><mo>)</mo></mrow></math>
    <p><math><msup><mi>f</mi><mn>2</mn></msup><msup><mi>f</mi><mo>+</mo></msup><mo>\u2032</mo><mi>x</mi></math></p>
  </main>`, 'typ/primes.html');
  const $ = load(note.html);
  assert.equal($('.math-prime').length, 5);
  assert.deepEqual($('.math-prime').toArray().map(el => $(el).text()), ['\u2032', '\u2032\u2032', '\u2032', '\u2032', '\u2032']);
  assert.ok($('msubsup > .math-prime').length, 'a subscripted base still marks its prime');
  assert.equal($('msub > .math-prime').length, 0, 'subscripts stay where they are');
  assert.equal($('msup > mn.math-prime').length, 0, 'exponents are not primes');
  assert.equal($('msup > mo.math-prime:not(:last-child)').length, 0, 'a plus-sign superscript is untouched');
  assert.equal($('mo.math-prime').not('msup > *, msubsup > *').length, 0, 'a prime that is not an attachment keeps its own position');
  assert.equal($('math').filter((_, el) => !$(el).hasClass('not-content')).length, 0);
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
