import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { validateRelease } from './validate-release.mjs';
import { buildLibrary } from '../src/lib/notebook.mjs';
const notes = JSON.parse(await readFile('.generated/notes.json', 'utf8'));
const manifests = JSON.parse(await readFile('.generated/subjects.json', 'utf8'));
const library = buildLibrary(notes, manifests);
const subjectFile = subject => `subjects/${subject.slug}.html`;
const home = load(await readFile('_site/index.html', 'utf8'));
const index = load(await readFile('_site/notes.html', 'utf8'));
const subjectPages = new Map(await Promise.all(library.subjects.map(async subject =>
  [subject.key, load(await readFile(`_site/${subjectFile(subject)}`, 'utf8'))])));
const subjectPage = note => subjectPages.get(library.byFile[note.file].key);
for (const note of notes) {
  const html = await readFile(`_site/${note.file}`, 'utf8');
  const $ = load(html);
  const original = load(note.html);
  // The notebook files, dates and orders notes from this metadata.
  assert.ok(note.date, `${note.file}: declared date (run scripts/build.sh so Calepin's page index is regenerated)`);
  assert.ok(note.path.endsWith('.typ'), `${note.file}: source path`);
  const row = index('.note-row').filter((_, el) => index(el).find('h3 a').attr('href') === `/${note.file}`);
  assert.equal(row.length, 1, `${note.file}: one row in the complete index`);
  const subject = subjectPage(note);
  const card = subject('.note-card').filter((_, el) => subject(el).find('h3 a').attr('href') === `/${note.file}`);
  assert.equal(card.length, 1, `${note.file}: one card on its subject page`);
  for (const links of [$('.note-tools .lean-source-link'), row.find('.lean-source-link')]) {
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
  // Every note is filed under a subject, and both the note and its subject page
  // link to each other.
  assert.equal($('.note-context a').first().attr('href'), `/subjects/${library.byFile[note.file].slug}.html`, `${note.file}: subject breadcrumb`);
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
// The home page stays a fixed-size cover: subjects and recent notes only, with
// every subject reachable and no leftover bucket for unrecognised folders.
assert.equal(home('.note-card').length, 0, 'home lists subjects rather than every note');
assert.equal(home('.subject-card').length, library.subjects.length, 'home: one card per subject');
assert.ok(home('.recent-list .recent-item').length <= library.recent.length, 'home: bounded recent list');
assert.equal(home('[href="/notes.html"]').length > 0, true, 'home links to the complete index');
for (const subject of library.subjects) {
  assert.equal(home(`.subject-card[href="/${subjectFile(subject)}"]`).length, 1, `home: ${subject.label} card`);
  assert.equal(index(`#subject-${subject.slug}`).length, 1, `index: ${subject.label} section`);
  assert.equal(index(`.subject-index a[href="#subject-${subject.slug}"]`).length, library.subjects.length > 1 ? 1 : 0, `index: ${subject.label} shortcut`);
  const page = subjectPages.get(subject.key);
  assert.equal(page('h1').text().trim(), subject.label, `${subject.label}: subject page heading`);
  assert.equal(page('.note-card').length, subject.count, `${subject.label}: every note of the subject`);
  assert.ok(page('.subject-intro .notes-meta').text().includes(subject.count === 1 ? '1 note' : `${subject.count} notes`), `${subject.label}: note count`);
}
assert.equal(index('.note-row').length, notes.length, 'index lists every note exactly once');
assert.equal(index('.notes-section').length, library.subjects.length, 'index has one section per subject');
await access('_site/pagefind/pagefind.js');
await access('_site/index.html');
await access('_site/about.html');
await access('_site/notes.html');
await access('_site/404.html');
for (const subject of library.subjects) await access(`_site/${subjectFile(subject)}`);
const about = load(await readFile('_site/about.html', 'utf8'));
assert.equal(about('h1').text().trim(), 'About', 'About page title');
assert.deepEqual(about('.about-page h2').toArray().map(el => about(el).text().trim()), [
  'Why this notebook exists',
  'How I work',
  "What you'll find",
  'An open notebook',
], 'About page sections');
assert.equal(about('a[href="/"]').length > 0, true, 'About links back to notes');
// The About page describes the subjects that actually exist.
for (const subject of library.subjects) assert.ok(about('.about-page').text().includes(subject.label), `About mentions ${subject.label}`);
// Guard the English-only publication, including metadata and accessible labels.
const publicPages = ['index.html', 'about.html', '404.html', 'notes.html', ...library.subjects.map(subjectFile), ...notes.map(note => note.file)];
for (const file of publicPages) {
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
await validateRelease('_site', notes, 'https://zzjrabbit.github.io', ['about.html', 'notes.html', ...library.subjects.map(subjectFile)]);
console.log(`OK: ${notes.length} notes in ${library.subjects.length} subjects, index/subject pages, local resources/anchors, canonical/sitemap, MathML/SVG, unchanged PDFs and search bundle`);
