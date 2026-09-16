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
// CI installs Playwright's pinned Chromium; local Nix users can use the system browser.
const executablePath = process.env.CHROMIUM_BIN || (process.env.CI ? undefined : execFileSync('sh', ['-c', 'command -v chromium || command -v chromium-browser'], { encoding: 'utf8' }).trim());
const browser = await chromium.launch({ executablePath, headless: true });
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
    for (const file of ['index.html', 'notes.html', subjectFiles[0], 'about.html', 'typ/lie/cover_linear.html', 'typ/real/func_eq_fdts.html']) {
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
    await route.fulfill({ body: await readFile(path.join('_site', file)),
      contentType: file.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await staticPage.goto('https://notes.test/typ/lie/cover_linear.html');
  assert.ok(await staticPage.locator('math').count());
  assert.equal(await staticPage.locator('math *').evaluateAll(nodes =>
    nodes.some(node => parseFloat(getComputedStyle(node).marginTop) !== 0)), false);
  await noJS.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://notes.test/');
  // The home page stays a cover: one card per subject, never one per note.
  const subjectCards = page.locator('.subject-card');
  assert.equal(await subjectCards.count(), library.subjects.length, 'home shows one card per subject');
  assert.equal(await page.locator('.note-card').count(), 0, 'home does not list every note');
  assert.equal(await page.locator('.recent-item').count(), library.recent.length, 'home: bounded recent list');
  const cardTargets = await subjectCards.evaluateAll(cards => cards.map(card => card.getAttribute('href')));
  for (const target of cardTargets) {
    await page.goto(`https://notes.test${target}`);
    assert.equal(await page.locator('h1').count(), 1, `subject page exists: ${target}`);
    assert.ok(await page.locator('.note-card').count(), `subject page lists notes: ${target}`);
    assert.equal(await page.locator('.subject-intro a[href="/notes.html"]').count(), 1, `subject page links back to the index: ${target}`);
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
  // after visiting a subject, coming back keeps its group open.
  const firstGroup = page.locator('#starlight__sidebar details').filter({ has: page.locator('a.group-link') }).first();
  const groupToggle = firstGroup.locator('summary .group-toggle');
  const subjectHref = await firstGroup.locator('a.group-link').getAttribute('href');
  if (!await firstGroup.evaluate(el => el.open)) await groupToggle.click();
  await firstGroup.locator('a.group-link').click();
  assert.equal(new URL(page.url()).pathname, subjectHref, 'sidebar label opens its subject page');
  await page.goto('https://notes.test/');
  assert.equal(await page.locator('#starlight__sidebar details').filter({ has: page.locator('a.group-link') }).first().evaluate(el => el.open), true, 'a label click does not collapse its group');
  // The caret keeps collapsing and expanding the group it sits in.
  assert.equal(await groupToggle.isVisible(), true, 'the group toggle is reachable');
  await groupToggle.click();
  assert.equal(await firstGroup.evaluate(el => el.open), false, 'the caret collapses the group');
  await groupToggle.click();
  assert.equal(await firstGroup.evaluate(el => el.open), true, 'the caret expands the group again');
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
  console.log('OK: 5 viewport widths, home cover, complete index, subject pages, long notes, mobile menu/Escape, themes, live search, no page errors');
  await context.tracing.stop();
} catch (error) {
  // Preserve the failing page, including failures before the named screenshots.
  await page?.screenshot({ path: '.generated/screenshots/failure.png', fullPage: true }).catch(() => {});
  await context?.tracing.stop({ path: '.generated/screenshots/browser-trace.zip' }).catch(() => {});
  throw error;
} finally { await browser.close(); }
