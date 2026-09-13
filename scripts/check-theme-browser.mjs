// Run after build:web: CHROMIUM_PATH=$(command -v chromium) node scripts/check-theme-browser.mjs
// Serve artifacts through Playwright routing; no development server required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  await page.route('https://notes.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      await route.fulfill({ body: await readFile(path.join('_site', pathname === '/' ? 'index.html' : pathname)), contentType: types[path.extname(pathname)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('https://notes.test/typ/lie/cover_linear.html');
  const picker = page.locator('starlight-theme-select:visible').first();
  const theme = () => page.locator('html').getAttribute('data-theme');
  const choose = async value => {
    await picker.locator(`label:has(input[value="${value}"])`).click();
  };
  assert.equal(await theme(), 'light');
  await choose('dark');
  assert.equal(await theme(), 'dark');
  const ink = () => page.locator('.note-diagram use').first().evaluate(el => getComputedStyle(el).fill);
  const darkInk = await ink();
  assert.notEqual(darkInk, 'rgb(0, 0, 0)');
  assert.equal(await page.locator('.note-diagram [stroke="#0055ff"]').first().evaluate(el => getComputedStyle(el).stroke), 'rgb(0, 85, 255)');
  await page.reload();
  assert.equal(await theme(), 'dark');
  await choose('light');
  assert.equal(await theme(), 'light');
  assert.notEqual(await ink(), darkInk);
  await choose('auto');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await picker.locator('input[value="light"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await theme(), 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await choose('light');
  assert.equal(await theme(), 'light');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Theme browser checks passed: persistence, system changes, keyboard, mobile, SVG ink and semantic colors.');
} finally {
  await browser.close();
}
