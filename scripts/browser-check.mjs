import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildLibrary } from '../src/lib/notebook.mjs';
// Browser checks run against whatever the bridge just produced.
const notes = JSON.parse(await readFile('.generated/notes.json', 'utf8'));
const library = buildLibrary(notes, JSON.parse(await readFile('.generated/subjects.json', 'utf8')));
const subjectFiles = library.subjects.map(subject => subject.href.slice(1));
const trackFiles = library.tracks.map(track => track.href.slice(1));
// CI installs Playwright's pinned Chromium; local Nix users can use the system browser.
const executablePath = process.env.CHROMIUM_BIN || (process.env.CI ? undefined : execFileSync('sh', ['-c', 'command -v chromium || command -v chromium-browser'], { encoding: 'utf8' }).trim());
const browser = await chromium.launch({ executablePath, headless: true });
// How far each prime clears the letter it belongs to, in ems of its formula:
// heights are measured above the base's own baseline, so a positive clearance
// means the apostrophe floats above the letter's ink — the bug this guards.
const primeClearances = page => page.locator('msup > .math-prime, msubsup > .math-prime').evaluateAll(nodes => nodes.map(node => {
  const base = node.parentElement.firstElementChild;
  const em = parseFloat(getComputedStyle(node.closest('math')).fontSize);
  const baseBox = base.getBoundingClientRect(), primeBox = node.getBoundingClientRect();
  return {
    base: base.textContent,
    inkBottom: +((baseBox.bottom - primeBox.bottom) / em).toFixed(3),
    clearance: +(((baseBox.bottom - primeBox.bottom) - (baseBox.bottom - baseBox.top)) / em).toFixed(3),
  };
}));
const errors = [];
let context;
let page;
try {
  await mkdir('.generated/screenshots', { recursive: true });
  context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  // Serve build artifacts inside Playwright interception; no replacement server.
  await context.route('https://notes.test/**', async route => {
    const url = new URL(route.request().url());
    let file = decodeURIComponent(url.pathname);
    if (file.endsWith('/')) file += 'index.html';
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
    try { await route.fulfill({ body: await readFile(path.join('_site', file)), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const file of ['index.html', 'notes.html', subjectFiles[0], trackFiles[0], 'about.html', 'typ/lie/cover_linear.html', 'typ/real/func_eq_fdts.html']) {
      await page.goto(`https://notes.test/${file}`);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow: ${file}`);
      assert.equal(await page.locator('h1').count(), 1);
      // Page overflow alone misses broken subscripts/fractions: Markdown's
      // sibling rule used to insert 16px top margins inside native MathML.
      const badMathSpacing = await page.locator('.typst-article math, .typst-article math *').evaluateAll(nodes =>
        nodes.filter(node => parseFloat(getComputedStyle(node).marginTop) !== 0)
          .map(node => ({ tag: node.tagName, margin: getComputedStyle(node).marginTop })));
      assert.deepEqual(badMathSpacing, [], `${width}px MathML spacing: ${file}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // A prime is an attachment, but MathML only has ordinary superscripts:
  // Chromium raised it by the superscript shift while the math font already
  // draws U+2032 high in its own em box, so `f'` showed the apostrophe above the
  // letter, clear of its ascender. The bridge marks prime superscripts and the
  // stylesheet lowers them to the x-height line the notes' own Typst rendering
  // uses. Checked in em, so it holds at every type size and viewport.
  for (const file of ['typ/lie/cover_linear.html', 'models/cafeteria/note.html']) {
    await page.goto(`https://notes.test/${file}`);
    await page.evaluate(() => document.fonts.ready);
    const primes = await primeClearances(page);
    assert.ok(primes.length, `${file} still publishes primes in MathML`);
    for (const prime of primes) {
      assert.ok(prime.clearance <= 0.01, `the prime in ${prime.base}' floats above the letter (${prime.clearance}em): ${file}`);
      assert.ok(prime.clearance >= -0.3, `the prime in ${prime.base}' sank into the letter (${prime.clearance}em): ${file}`);
    }
  }
  // Cross-platform consistency: the serif prose and math faces are self-hosted,
  // so a missing or mis-served font file has to fail here instead of silently
  // becoming whatever font each reader's system happens to call serif or math.
  await page.goto('https://notes.test/typ/lie/cover_linear.html');
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() => ({
    loaded: [...document.fonts].filter(face => face.status === 'loaded').map(face => `${face.family} ${face.weight} ${face.style}`),
    prose: getComputedStyle(document.querySelector('.typst-article')).fontFamily,
    math: getComputedStyle(document.querySelector('.typst-article math')).fontFamily,
  }));
  for (const face of ['STIX Two Text 400 normal', 'STIX Two Math 400 normal']) {
    assert.ok(faces.loaded.includes(face), `${face} is delivered and loaded: ${faces.loaded.join(', ')}`);
  }
  assert.match(faces.prose, /^['"]?STIX Two Text/, 'prose is set in the bundled serif');
  assert.match(faces.math, /^['"]?STIX Two Math/, 'mathematics is set in the bundled serif');
  // Metrics of a math specimen, against the platform's own fallback: identical
  // widths would mean the bundled face never rendered.
  const specimen = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d');
    const width = font => { canvas.font = `100px ${font}`; return canvas.measureText('\u{1D453}\u{1D465}\u{1D466}\u2032').width; };
    return { bundled: width('"STIX Two Math"'), fallback: width('sans-serif') };
  });
  assert.ok(Math.abs(specimen.bundled - specimen.fallback) > specimen.fallback * 0.05,
    `the bundled math face really renders (${specimen.bundled.toFixed(1)}px against ${specimen.fallback.toFixed(1)}px)`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://notes.test/about.html');
  assert.equal(await page.locator('#starlight__sidebar a[aria-current="page"]').textContent(), 'About');
  await page.screenshot({ path: '.generated/screenshots/about-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('https://notes.test/about.html');
  await page.screenshot({ path: '.generated/screenshots/about-desktop.png', fullPage: true });
  // Native math must not depend on the overflow enhancement script.
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.route('https://notes.test/**', async route => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname);
    const types = { '.css': 'text/css', '.woff2': 'font/woff2' };
    await route.fulfill({ body: await readFile(path.join('_site', file)),
      contentType: types[path.extname(file)] || 'text/html' });
  });
  await staticPage.goto('https://notes.test/typ/lie/cover_linear.html');
  assert.ok(await staticPage.locator('math').count());
  assert.equal(await staticPage.locator('math *').evaluateAll(nodes =>
    nodes.some(node => parseFloat(getComputedStyle(node).marginTop) !== 0)), false);
  // The prime correction is build-time CSS, so it must hold with no script at all.
  const staticPrimes = await primeClearances(staticPage);
  assert.ok(staticPrimes.length, 'primes remain marked without JavaScript');
  for (const prime of staticPrimes) {
    assert.ok(prime.clearance <= 0.01, `without JavaScript the prime in ${prime.base}' floats above the letter (${prime.clearance}em)`);
  }
  await noJS.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://notes.test/');
  // The home page stays a cover: one panel per track, one card per subject,
  // never one card per note.
  const subjectCards = page.locator('.subject-card');
  assert.equal(await subjectCards.count(), library.subjects.length, 'home shows one card per subject');
  assert.equal(await page.locator('.track-panel').count(), library.tracks.length, 'home shows one panel per track');
  assert.equal(await page.locator('.note-card').count(), 0, 'home does not list every note');
  assert.equal(await page.locator('.recent-item').count(), library.recent.length, 'home: bounded recent list');
  const cardTargets = await subjectCards.evaluateAll(cards => cards.map(card => card.getAttribute('href')));
  for (const target of cardTargets) {
    await page.goto(`https://notes.test${target}`);
    assert.equal(await page.locator('h1').count(), 1, `subject page exists: ${target}`);
    assert.ok(await page.locator('.note-card').count(), `subject page lists notes: ${target}`);
    assert.equal(await page.locator('.subject-intro a[href="/notes.html"]').count(), 1, `subject page links back to the index: ${target}`);
    assert.equal(await page.locator('.subject-intro a[href^="/tracks/"]').count(), 1, `subject page states its track: ${target}`);
  }
  // Mathematics and physics are parallel lines a reader can walk: every track
  // has a landing page listing its subjects, empty ones included.
  for (const track of library.tracks) {
    await page.goto(`https://notes.test${track.href}`);
    assert.equal(await page.locator('h1').count(), 1, `track page exists: ${track.href}`);
    assert.equal(await page.locator('.subject-card').count(), track.subjectCount, `track page lists its subjects: ${track.href}`);
    assert.equal(await page.locator('.track-empty-note').count(), track.subjectCount ? 0 : 1, `track page states an empty track: ${track.href}`);
  }
  // The complete index stays reachable and lists every note exactly once.
  await page.goto('https://notes.test/notes.html');
  assert.equal(await page.locator('.note-row').count(), library.total, 'index lists every note');
  await page.goto('https://notes.test/');
  await page.locator('button[popovertarget="starlight__sidebar"]').click();
  assert.ok(await page.locator('#starlight__sidebar').evaluate(el => el.matches(':popover-open')));
  // Navigation remains comfortable to tap and long titles stay in the drawer.
  for (const item of await page.locator('#starlight__sidebar .top-level a, #starlight__sidebar summary').all()) {
    if (!await item.isVisible()) continue;
    const box = await item.boundingBox();
    assert.ok(box.height >= 44, 'sidebar navigation has a 44px touch target');
    assert.ok(box.x >= 0 && box.x + box.width <= 391, 'sidebar item fits mobile viewport');
  }
  await page.screenshot({ path: '.generated/screenshots/sidebar-mobile.png' });
  // Every subject is one click away from the navigation: the group label is a
  // link to its subject page, and the caret beside it is the group toggle.
  const groupLinks = await page.locator('#starlight__sidebar a.group-link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.deepEqual(groupLinks.slice().sort(), library.subjects.map(subject => subject.href).sort(), 'sidebar links every subject page');
  // The tracks are the layer above: one group each, in order, opened by their
  // own label, and still present while they have no notes to show.
  const trackLinks = await page.locator('#starlight__sidebar a.track-link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.deepEqual(trackLinks, library.tracks.map(track => track.href), 'sidebar lists every track as its own group');
  assert.equal(await page.locator('#starlight__sidebar .track-empty').count(), library.tracks.filter(track => !track.count).length, 'an empty track keeps its place in the sidebar');
  const tracksWithNotes = library.tracks.filter(track => track.count);
  await page.locator(`#starlight__sidebar a.track-link[href="${tracksWithNotes[0].href}"]`).click();
  assert.equal(new URL(page.url()).pathname, tracksWithNotes[0].href, 'clicking a track label opens that track');
  assert.equal(await page.locator('h1').count(), 1, 'track page opened from the sidebar');
  await page.goto('https://notes.test/');
  await page.locator('button[popovertarget="starlight__sidebar"]').click();
  await page.locator(`#starlight__sidebar a.group-link[href="${groupLinks[0]}"]`).click();
  assert.equal(new URL(page.url()).pathname, groupLinks[0], 'clicking a subject group label opens that subject');
  assert.equal(await page.locator('h1').count(), 1, 'subject page opened from the sidebar');
  // The mobile drawer still opens and closes with the menu button and Escape.
  await page.goto('https://notes.test/');
  await page.locator('button[popovertarget="starlight__sidebar"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#starlight__sidebar').evaluate(el => el.matches(':popover-open')), false);
  await page.screenshot({ path: '.generated/screenshots/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('https://notes.test/');
  // The sidebar state persister must not mistake a label click for a toggle:
  // after visiting a subject, coming back keeps its group open. Subject groups
  // are the `<details>` whose own summary holds the group link — a track group
  // contains subject links as descendants but never as its own label.
  const subjectGroup = '#starlight__sidebar details:has(> summary a.group-link)';
  const firstGroup = page.locator(subjectGroup).first();
  const groupToggle = firstGroup.locator('summary .group-toggle');
  const subjectHref = await firstGroup.locator('a.group-link').getAttribute('href');
  if (!await firstGroup.evaluate(el => el.open)) await groupToggle.click();
  await firstGroup.locator('a.group-link').click();
  assert.equal(new URL(page.url()).pathname, subjectHref, 'sidebar label opens its subject page');
  await page.goto('https://notes.test/');
  assert.equal(await page.locator(subjectGroup).first().evaluate(el => el.open), true, 'a label click does not collapse its group');
  // The caret keeps collapsing and expanding the group it sits in.
  assert.equal(await groupToggle.isVisible(), true, 'the group toggle is reachable');
  await groupToggle.click();
  assert.equal(await firstGroup.evaluate(el => el.open), false, 'the caret collapses the group');
  await groupToggle.click();
  assert.equal(await firstGroup.evaluate(el => el.open), true, 'the caret expands the group again');
  // The current page is marked on exactly one row, and the mark is drawn on the
  // row rather than on the label inside it: a track or subject label is the link
  // to that page and has no inline padding of its own, so a chip drawn on the
  // link used to put its accent rule on the first letter of the title. A track
  // whose own page is open also lists "No notes yet" at the same URL; that row
  // must not repeat the mark its heading already carries.
  const cueRow = '#starlight__sidebar summary[data-current], #starlight__sidebar a[aria-current="page"]:not(.group-link):not(.track-link)';
  const emptyTrack = library.tracks.find(track => !track.count);
  for (const file of [emptyTrack?.href.slice(1), subjectFiles[0], 'about.html'].filter(Boolean)) {
    await page.goto(`https://notes.test/${file}`);
    assert.equal(await page.locator(cueRow).count(), 1, `sidebar marks one current row: ${file}`);
    assert.equal(await page.locator('#starlight__sidebar [aria-current="page"]').count(), 1, `sidebar marks one current link: ${file}`);
    const clearance = await page.locator(cueRow).evaluate(el => {
      const label = el.querySelector('span.large') || el.querySelector('span');
      return label.getBoundingClientRect().left - el.getBoundingClientRect().left;
    });
    assert.ok(clearance >= 8, `the current row's accent rule clears its label (${file}: ${clearance.toFixed(1)}px)`);
  }
  // The select is a hidden Starlight compatibility bridge. Exercise the visible
  // radio labels, as users do, rather than trying to interact with that bridge.
  const picker = page.locator('starlight-theme-select:visible').first();
  const chooseTheme = async value => {
    await picker.locator(`label:has(input[value="${value}"])`).click();
    await expect(picker.locator(`input[value="${value}"]`)).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  };
  await chooseTheme('dark');
  await page.screenshot({ path: '.generated/screenshots/desktop-dark.png', fullPage: true });
  await chooseTheme('light');
  await page.screenshot({ path: '.generated/screenshots/desktop.png', fullPage: true });
  await page.locator('site-search button').first().click();
  await page.locator('.pagefind-ui__search-input').fill('Continuity');
  await page.locator('.pagefind-ui__result-link').first().waitFor();
  assert.ok((await page.locator('.pagefind-ui__result-link').allTextContents()).some(text => text.includes('Continuity')));
  assert.deepEqual(errors, []);
  console.log('OK: 5 viewport widths, home tracks/subject cover, complete index, track and subject pages, long notes, mobile menu/Escape, themes, live search, no page errors');
  await context.tracing.stop();
} catch (error) {
  // Preserve the failing page, including failures before the named screenshots.
  await page?.screenshot({ path: '.generated/screenshots/failure.png', fullPage: true }).catch(() => {});
  await context?.tracing.stop({ path: '.generated/screenshots/browser-trace.zip' }).catch(() => {});
  throw error;
} finally { await browser.close(); }
