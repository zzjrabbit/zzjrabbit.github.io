import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { validateRelease } from './validate-release.mjs';
const notes = JSON.parse(await readFile('.generated/notes.json', 'utf8'));
const home = load(await readFile('_site/index.html', 'utf8'));
for (const note of notes) {
  const html = await readFile(`_site/${note.file}`, 'utf8');
  const $ = load(html);
  const original = load(note.html);
  const card = home('.note-card').filter((_, el) => home(el).find('h3 a').attr('href') === `/${note.file}`);
  assert.equal(card.length, 1, `${note.file}: home card`);
  for (const links of [$('.note-tools .lean-source-link'), card.find('.lean-source-link')]) {
    assert.equal(links.length, note.leanSource ? 1 : 0, `${note.file}: conditional Lean link`);
    if (note.leanSource) assert.equal(links.attr('href'), note.leanSource, `${note.file}: matching Lean source`);
  }
  if (note.leanSource) {
    const lean = note.file.replace(/^typ\//, 'lean/').replace(/\.html$/, '.lean');
    await access(`site/${lean}`);
    assert.equal(note.leanSource, `https://github.com/zzjrabbit/notes/blob/main/${lean.split('/').map(encodeURIComponent).join('/')}`);
  }
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('h1').length, 1, `${note.file}: single page title`);
  assert.equal($('.typst-article').attr('lang'), 'en', `${note.file}: article language`);
  assert.equal($('.note-tools a[download]').attr('aria-describedby'), 'source-download-note');
  assert.ok($('#source-download-note').text().includes('without shared templates or dependencies'), `${note.file}: source download explanation`);
  for (const selector of ['math', 'svg', '.note-environment']) {
    assert.equal($('.typst-article').find(selector).length, original(selector).length, `${note.file}: ${selector} preserved`);
  }
  assert.deepEqual($('.typst-article math').toArray().map(el => $(el).text()), original('math').toArray().map(el => original(el).text()), `${note.file}: formula content preserved`);
  assert.ok($('site-search').length, `${note.file}: Starlight search`);
  assert.ok($('button[popovertarget="starlight__sidebar"]').length, `${note.file}: mobile navigation`);
  for (const heading of note.headings) assert.ok($(`[id="${heading.slug}"]`).length, `Missing anchor ${heading.slug}`);
  for (const el of $('a[href],img[src],image[href]').toArray()) {
    const href = $(el).attr('href') || $(el).attr('src');
    if (!href || /^(?:[a-z]+:|\/\/|#)/i.test(href)) continue;
    const url = new URL(href, `https://notes.invalid/${note.file}`);
    let target = decodeURIComponent(url.pathname);
    if (target.endsWith('/')) target += 'index.html';
    await access(`_site${target}`).catch(() => { throw new Error(`${note.file}: broken local link ${href}`); });
  }
  const pdf = note.file.replace(/\.html$/, '.pdf');
  assert.deepEqual(await readFile(`_site/${pdf}`), await readFile(`_calepin/${pdf}`), `PDF unchanged: ${pdf}`);
}
await access('_site/pagefind/pagefind.js');
await access('_site/index.html');
await access('_site/about.html');
await access('_site/404.html');
const about = load(await readFile('_site/about.html', 'utf8'));
assert.equal(about('h1').text().trim(), 'About', 'About page title');
assert.deepEqual(about('.about-page h2').toArray().map(el => about(el).text().trim()), [
  'Why this notebook exists',
  'How I work',
  "What you'll find",
  'An open notebook',
], 'About page sections');
assert.equal(about('a[href="/"]').length > 0, true, 'About links back to notes');
// Guard the English-only publication, including metadata and accessible labels.
for (const file of ['index.html', 'about.html', '404.html', ...notes.map(note => note.file)]) {
  const $ = load(await readFile(`_site/${file}`, 'utf8'));
  assert.equal($('html').attr('lang'), 'en', `${file}: English document language`);
  $('script, style').remove();
  assert.doesNotMatch($.root().text(), /\p{Script=Han}/u, `${file}: no untranslated Chinese text`);
  for (const el of $('[aria-label], [title], [alt], meta[content]').toArray()) {
    for (const attr of ['aria-label', 'title', 'alt', 'content']) {
      assert.doesNotMatch($(el).attr(attr) || '', /\p{Script=Han}/u, `${file}: English ${attr}`);
    }
  }
}
await assert.rejects(access('_site/atom.xml'), 'Atom feed must not be published');
await validateRelease('_site', notes, 'https://zzjrabbit.github.io', ['about.html']);
console.log(`OK: ${notes.length} Starlight pages, local resources/anchors, canonical/sitemap, MathML/SVG, unchanged PDFs and search bundle`);
