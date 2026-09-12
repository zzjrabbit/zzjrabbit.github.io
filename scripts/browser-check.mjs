import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
// CI installs Playwright's pinned Chromium; local Nix users can use the system browser.
const executablePath = process.env.CHROMIUM_BIN || (process.env.CI ? undefined : execFileSync('sh', ['-c', 'command -v chromium || command -v chromium-browser'], { encoding: 'utf8' }).trim());
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
try {
  const context = await browser.newContext();
  // Serve build artifacts inside Playwright interception; no replacement server.
  await context.route('https://notes.test/**', async route => {
    const url = new URL(route.request().url());
    let file = decodeURIComponent(url.pathname);
    if (file.endsWith('/')) file += 'index.html';
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
    try { await route.fulfill({ body: await readFile(path.join('_site', file)), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('.generated/screenshots', { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const file of ['index.html', 'about.html', 'typ/lie/cover_linear.html', 'typ/real/func_eq_fdts.html']) {
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
  const subjectLinks = page.locator('.subject-index a');
  assert.ok(await subjectLinks.count(), 'home exposes subject navigation');
  for (const link of await subjectLinks.all()) {
    const target = await link.getAttribute('href');
    assert.equal(await page.locator(target).count(), 1, `subject anchor exists: ${target}`);
  }
  const notes = JSON.parse(await readFile('.generated/notes.json', 'utf8'));
  assert.equal(await page.locator('.note-card h3 a').count(), notes.length);
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
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#starlight__sidebar').evaluate(el => el.matches(':popover-open')), false);
  await page.screenshot({ path: '.generated/screenshots/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('https://notes.test/');
  await page.locator('starlight-theme-select select:visible').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: '.generated/screenshots/desktop-dark.png', fullPage: true });
  await page.locator('starlight-theme-select select:visible').selectOption('light');
  await page.screenshot({ path: '.generated/screenshots/desktop.png', fullPage: true });
  await page.locator('site-search button').first().click();
  await page.locator('.pagefind-ui__search-input').fill('Continuity');
  await page.locator('.pagefind-ui__result-link').first().waitFor();
  assert.ok((await page.locator('.pagefind-ui__result-link').allTextContents()).some(text => text.includes('Continuity')));
  assert.deepEqual(errors, []);
  console.log('OK: 5 viewport widths, long notes, mobile menu/Escape, themes, live search, no page errors');
} finally { await browser.close(); }
