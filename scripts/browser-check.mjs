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
// Formulas are static CHTML in the document already; only the web fonts still
// arrive asynchronously. Waiting for them keeps the geometry assertions stable.
const mathReady = async target => {
  await target.evaluate(() => document.fonts.ready);
  await target.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const readMathState = target => target.evaluate(() => {
  const containers = [...document.querySelectorAll('.typst-article mjx-container')];
  const wrappers = [...document.querySelectorAll('.typst-article .math-rendered')];
  const visible = el => el.getClientRects().length > 0;
  const shown = containers.filter(visible);
  const sourceIds = new Set(wrappers.map(wrapper => wrapper.dataset.kpSource).filter(Boolean));
  const visibleSourceIds = new Set(wrappers.filter(wrapper => wrapper.querySelector('mjx-container') && [...wrapper.querySelectorAll('mjx-container')].some(visible)).map(wrapper => wrapper.dataset.kpSource).filter(Boolean));
  const kpLines = [...document.querySelectorAll('.typst-article .kp-line')];
  return {
    proseAlign: document.querySelector('.typst-article') ? getComputedStyle(document.querySelector('.typst-article')).textAlign : null,
    wrappers: wrappers.length,
    sourceWrappers: sourceIds.size,
    visibleSourceWrappers: visibleSourceIds.size,
    containers: shown.length,
    variants: containers.length,
    missingVariant: wrappers.filter(wrapper => [...wrapper.children].filter(visible).length !== 1).length,
    overlappingLines: shown.filter(container => [...container.querySelectorAll('mjx-linestack[breakable]')].filter(visible).some(stack => {
      const lines = [...stack.querySelectorAll(':scope > mjx-linebox')].filter(visible);
      return lines.some((line, index) => index && line.getBoundingClientRect().top < lines[index - 1].getBoundingClientRect().bottom - .5);
    })).length,
    unflowedInlineMath: shown.filter(container => container.getAttribute('display') !== 'true'
      && container.querySelector('mjx-linestack[breakable]')
      && getComputedStyle(container).display !== 'inline').length,
    native: document.querySelectorAll('.typst-article math').length,
    runtime: Boolean(window.MathJax),
    stretchyBreaks: [...document.querySelectorAll('.typst-article mjx-break')].filter(el => /\s/.test(el.textContent)).length,
    wrongOutput: containers.filter(el => el.getAttribute('jax') !== 'CHTML').length,
    wrongOverflow: shown.filter(el => el.getAttribute('overflow') !== 'linebreak').length,
    scrollContainers: shown.filter(el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).length,
    overflowing: shown.filter(el => el.scrollWidth > el.clientWidth + 1).length,
    outsideViewport: shown.filter(el => {
      const box = el.getBoundingClientRect();
      return box.left < -1 || box.right > innerWidth + 1;
    }).length,
    inlineMargins: shown.filter(el => el.getAttribute('display') !== 'true' && (parseFloat(getComputedStyle(el).marginTop) !== 0 || parseFloat(getComputedStyle(el).marginBottom) !== 0)).length,
    kpParagraphs: document.querySelectorAll('.typst-article p[data-kp-layout]').length,
    kpLines: kpLines.length,
    kpOverflow: kpLines.filter(line => line.scrollWidth > line.clientWidth + 1).length,
    kpBadLastLine: kpLines.filter(line => !line.matches('.kp-section > .kp-line:last-child') && getComputedStyle(line).textAlignLast !== 'justify').length,
  };
});
const errors = [];
const mathRuntimeRequests = [];
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
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
    try { await route.fulfill({ body: await readFile(path.join('_site', file)), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/mathjax\/(?:mml|tex|sre|.*\.js)/.test(pathname)) mathRuntimeRequests.push(pathname);
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const file of ['index.html', 'notes.html', subjectFiles[0], trackFiles[0], 'about.html', 'typ/lie/cover_linear.html', 'typ/real/func_eq_fdts.html']) {
      await page.goto(`https://notes.test/${file}`);
      await mathReady(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow: ${file}`);
      assert.equal(await page.locator('h1').count(), 1);
      // Every formula is already static CHTML. Exactly one break variant may be
      // visible at a time, and the shown container must neither inherit block
      // spacing when inline nor turn into a scroll area.
      const mathState = await readMathState(page);
      if (file.startsWith('typ/')) {
        assert.ok(mathState.containers > 0, `${width}px: static CHTML renders ${file}`);
        assert.equal(mathState.native, 0, `${width}px: no unrendered MathML remains: ${file}`);
        assert.equal(mathState.runtime, false, `${width}px: no MathJax runtime is loaded: ${file}`);
        assert.equal(mathState.stretchyBreaks, 0, `${width}px: inline break points are not stretchable: ${file}`);
        assert.equal(mathState.missingVariant, 0, `${width}px: every formula shows exactly one variant: ${file}`);
        assert.equal(mathState.wrongOutput, 0, `${width}px: every formula uses CHTML: ${file}`);
        assert.equal(mathState.wrongOverflow, 0, `${width}px: every formula permits line breaking: ${file}`);
        assert.equal(mathState.scrollContainers, 0, `${width}px: formulas are not scroll containers: ${file}`);
        assert.equal(mathState.overflowing, 0, `${width}px: formulas do not overflow their containers: ${file}`);
        assert.equal(mathState.outsideViewport, 0, `${width}px: formulas stay inside the viewport: ${file}`);
        assert.equal(mathState.inlineMargins, 0, `${width}px: inline formulas carry no block margin: ${file}`);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Cross-platform consistency: the serif prose and math faces are self-hosted,
  // so a missing or mis-served font file has to fail here instead of silently
  // becoming whatever font each reader's system happens to call serif or math.
  await page.goto('https://notes.test/typ/lie/cover_linear.html');
  await mathReady(page);
  const faces = await page.evaluate(() => ({
    loaded: [...document.fonts].filter(face => face.status === 'loaded').map(face => `${face.family} ${face.weight} ${face.style}`),
    prose: getComputedStyle(document.querySelector('.typst-article')).fontFamily,
    math: getComputedStyle(document.querySelector('.typst-article mjx-math')).fontFamily,
    runtime: Boolean(window.MathJax),
  }));
  assert.ok(faces.loaded.includes('STIX Two Text 400 normal'), `STIX Two Text is delivered and loaded: ${faces.loaded.join(', ')}`);
  assert.match(faces.prose, /^['"]?STIX Two Text/, 'prose is set in the bundled serif');
  assert.match(faces.math, /MJX-STX/, 'mathematics is set in MathJax\'s bundled STIX2 face');
  assert.ok(faces.loaded.some(face => /^MJX-STX-\S+ normal normal$/.test(face)), `MathJax STIX2 is delivered and loaded: ${faces.loaded.join(', ')}`);
  assert.equal(faces.runtime, false, 'formulas are already typeset; no MathJax runtime is requested');
  // Metrics of a math specimen, against the platform's own fallback: identical
  // widths would mean the bundled face never rendered.
  const specimen = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d');
    const width = font => { canvas.font = `100px ${font}`; return canvas.measureText('mmmmmmmmmm').width; };
    return { bundled: width('"STIX Two Text"'), fallback: width('serif') };
  });
  assert.ok(Math.abs(specimen.bundled - specimen.fallback) > specimen.fallback * 0.05,
    `the bundled prose face really renders (${specimen.bundled.toFixed(1)}px against ${specimen.fallback.toFixed(1)}px)`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://notes.test/about.html');
  assert.equal(await page.locator('#starlight__sidebar a[aria-current="page"]').textContent(), 'About');
  await page.screenshot({ path: '.generated/screenshots/about-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('https://notes.test/about.html');
  await page.screenshot({ path: '.generated/screenshots/about-desktop.png', fullPage: true });
  // Static CHTML is the primary representation, so formulas must be complete
  // even when scripts are disabled entirely.
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.route('https://notes.test/**', async route => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname);
    const types = { '.css': 'text/css', '.woff2': 'font/woff2' };
    await route.fulfill({ body: await readFile(path.join('_site', file)),
      contentType: types[path.extname(file)] || 'text/html' });
  });
  await staticPage.goto('https://notes.test/typ/lie/cover_linear.html');
  assert.ok(await staticPage.locator('.typst-article mjx-container').count());
  assert.equal(await staticPage.locator('.typst-article math').count(), 0, 'formulas need no browser-side MathML conversion');
  assert.ok((await staticPage.locator('.typst-article .math-rendered').first().textContent()).trim(), 'formula content is present without scripts');
  await noJS.close();
  // Every note must keep all of its formulas inside the text column at every
  // viewport: the build-time line breaker selects a narrow enough variant
  // instead of scaling formulas down or putting them in a scroll container.
  // Each source formula becomes one wrapper with exactly one visible variant.
  const sourceMath = new Map(notes.map(note => [note.file, note.mathCount]));
  const justifiedByWidth = new Map();
  let justifiedLines = 0;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const note of notes) {
      await page.goto(`https://notes.test/${note.file}`);
      await mathReady(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px page overflow: ${note.file}`);
      const state = await readMathState(page);
      assert.equal(state.proseAlign, 'justify', `${width}px: prose is justified: ${note.file}`);
      assert.equal(state.native, 0, `${width}px: no unrendered MathML remains: ${note.file}`);
      assert.equal(state.runtime, false, `${width}px: no MathJax runtime is loaded: ${note.file}`);
      assert.equal(state.stretchyBreaks, 0, `${width}px: inline break points are not stretchable: ${note.file}`);
      assert.equal(state.sourceWrappers, sourceMath.get(note.file), `${width}px: one wrapper per source formula: ${note.file}`);
      assert.equal(state.visibleSourceWrappers, sourceMath.get(note.file), `${width}px: every source formula is visible: ${note.file}`);
      assert.ok(state.containers >= state.sourceWrappers, `${width}px: split formulas keep at least one visible container each: ${note.file}`);
      assert.equal(state.missingVariant, 0, `${width}px: every formula has one visible break variant: ${note.file}`);
      assert.equal(state.overlappingLines, 0, `${width}px: wrapped formula lines do not overlap: ${note.file}`);
      assert.equal(state.unflowedInlineMath, 0, `${width}px: wrapped inline formulas stay in the text flow: ${note.file}`);
      assert.equal(state.wrongOutput, 0, `${width}px: every formula uses CHTML: ${note.file}`);
      assert.equal(state.wrongOverflow, 0, `${width}px: every formula permits line breaking: ${note.file}`);
      assert.equal(state.scrollContainers, 0, `${width}px: formulas are not scroll containers: ${note.file}`);
      assert.equal(state.overflowing, 0, `${width}px: formulas do not overflow their containers: ${note.file}`);
      assert.equal(state.outsideViewport, 0, `${width}px: formulas stay inside the viewport: ${note.file}`);
      assert.equal(state.inlineMargins, 0, `${width}px: inline formulas carry no block margin: ${note.file}`);
      assert.equal(state.kpOverflow, 0, `${width}px: justified lines stay inside the text column: ${note.file}`);
      assert.equal(state.kpBadLastLine, 0, `${width}px: non-final justified lines align both margins: ${note.file}`);
      if (state.kpLines) justifiedByWidth.set(width, (justifiedByWidth.get(width) || 0) + 1);
      justifiedLines += state.kpLines;
    }
  }
  for (const width of [390, 768, 1440]) {
    assert.ok((justifiedByWidth.get(width) || 0) >= notes.length * 0.6, `${width}px: most notes use the PDF-style line breaker (${justifiedByWidth.get(width) || 0}/${notes.length})`);
  }
  assert.ok(justifiedLines > 100, 'the line breaker lays out substantial note prose');
  // The line breaker must survive a live width change and step aside for print.
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto('https://notes.test/typ/problems/fe_finite_set.html');
  await mathReady(page);
  assert.ok(await page.locator('.kp-line').count() > 10, 'long note starts with PDF-style lines');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => document.querySelectorAll('.kp-line').length > 0, null, { timeout: 3000 });
  assert.ok(await page.locator('.typst-article p[data-kp-layout]').count() > 0, 'resizing recomputes the line layout');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'resized line layout stays inside the viewport');
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('.typst-article p[data-kp-layout]').count(), 0, 'printing restores the original paragraph DOM');
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await page.waitForFunction(() => document.querySelectorAll('.kp-line').length > 0, null, { timeout: 3000 });
  assert.ok(await page.locator('.typst-article p[data-kp-layout]').count() > 0, 'screen layout returns after printing');
  // A wide formula must actually wrap at phone width. Display fallbacks carry
  // precomputed line boxes; browser-broken inline formulas expose one client
  // rect per line instead.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const file of ['typ/problems/fe_finite_set.html', 'phys/dynamics/sling.html']) {
    await page.goto(`https://notes.test/${file}`);
    await mathReady(page);
    const tallest = await page.locator('.typst-article mjx-container').evaluateAll(containers => containers.filter(el => el.getClientRects().length).reduce((best, el) => {
      const precomputed = el.querySelectorAll('mjx-linestack > mjx-linebox').length;
      const browserLines = [...el.getClientRects()].filter(rect => rect.width > 0).length;
      const lines = Math.max(precomputed, browserLines);
      return lines > best.lines ? { lines, text: el.textContent.slice(0, 40) } : best;
    }, { lines: 0, text: '' }));
    assert.ok(tallest.lines > 1, `a long formula wraps onto multiple lines at 390px: ${file} (${tallest.lines} lines, ${tallest.text})`);
  }
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
  assert.deepEqual(mathRuntimeRequests, [], 'notes never request a MathJax runtime or speech worker');
  assert.deepEqual(errors, []);
  console.log('OK: 5 viewport widths, home tracks/subject cover, complete index, track and subject pages, long notes, mobile menu/Escape, themes, live search, no page errors');
  await context.tracing.stop();
} catch (error) {
  // Preserve the failing page, including failures before the named screenshots.
  await page?.screenshot({ path: '.generated/screenshots/failure.png', fullPage: true }).catch(() => {});
  await context?.tracing.stop({ path: '.generated/screenshots/browser-trace.zip' }).catch(() => {});
  throw error;
} finally { await browser.close(); }
