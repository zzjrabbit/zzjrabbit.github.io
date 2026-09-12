import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { validateRelease } from './validate-release.mjs';
const notes = JSON.parse(await readFile('.generated/notes.json', 'utf8'));
for (const note of notes) {
  const html = await readFile(`_site/${note.file}`, 'utf8');
  const $ = load(html);
  const original = load(note.html);
  assert.equal($('html').attr('lang'), 'zh-CN');
  assert.equal($('h1').length, 1, `${note.file}: single page title`);
  assert.ok(['en', 'zh-CN'].includes($('.typst-article').attr('lang')), `${note.file}: article language`);
  assert.equal($('.note-tools a[download]').attr('aria-describedby'), 'source-download-note');
  assert.ok($('#source-download-note').text().includes('不含共享模板'), `${note.file}: source download explanation`);
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
await access('_site/404.html');
await validateRelease('_site', notes);
console.log(`OK: ${notes.length} Starlight pages, local resources/anchors, canonical/sitemap/Atom, MathML/SVG, unchanged PDFs and search bundle`);
