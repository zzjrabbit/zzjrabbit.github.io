// Inspect built pages without starting a server.
// CHROMIUM_PATH=$(command -v chromium) node scripts/check-readability.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildLibrary } from '../src/lib/notebook.mjs';
const library = buildLibrary(
  JSON.parse(await readFile('.generated/notes.json', 'utf8')),
  JSON.parse(await readFile('.generated/subjects.json', 'utf8')));
const subjectPage = library.subjects[0].href;
const trackPage = (library.tracks.find(track => track.subjectCount) || library.tracks[0]).href;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  await page.route('https://notes.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? '/index.html' : pathname;
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    try { await route.fulfill({ body: await readFile(path.join('_site', file === '/' ? 'index.html' : file)), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  const failures = [];
  for (const theme of ['light', 'dark']) {
    for (const file of ['/', '/notes.html', subjectPage, trackPage, '/about.html', '/typ/lie/cover_linear.html', '/typ/real/func_eq_fdts.html']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto('https://notes.test' + file);
      await page.addStyleTag({ content: '* { transition: none !important; }' });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const contrast = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgb = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); const c = [...ctx.getImageData(0, 0, 1, 1).data]; return [c[0], c[1], c[2], c[3] / 255]; };
        const luminance = channels => channels.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const results = [];
        const selectors = '.notes-description, .notes-meta, .notes-license, .note-card p, .card-kicker, .card-footer, .section-count, .note-tools a, .subject-index a, .about-page section p, .typst-article p, .note-environment-title, starlight-toc a, #starlight__sidebar a, #starlight__sidebar summary[data-current] .large, .pagination-links a, .subject-card h3, .subject-blurb, .subject-latest, .subject-count, .recent-title, .recent-meta, .row-summary, .row-meta, .row-date, .note-context, .index-lead, .subject-lead, .section-heading .section-more, .track-panel h3, .track-panel p, .track-figures, .track-latest, .track-more, .track-group-heading h3, .track-group-heading a, .track-heading-blurb, .track-lead, .track-empty-note, .index-track-label';
        for (const el of document.querySelectorAll(selectors)) {
          if (!el.getClientRects().length) continue;
          const style = getComputedStyle(el);
          let parent = el, bg;
          while (parent) {
            const channels = rgb(getComputedStyle(parent).backgroundColor);
            if (channels && (channels[3] ?? 1) === 1) { bg = channels; break; }
            parent = parent.parentElement;
          }
          // Solid backgrounds only; gradients require visual review separately.
          if (!bg) continue;
          const fg = rgb(style.color);
          if (!fg || (fg[3] ?? 1) !== 1) continue;
          const a = luminance(fg), b = luminance(bg);
          const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) results.push({ text: el.textContent.trim().slice(0, 60), ratio: +ratio.toFixed(2) });
        }
        return results;
      });
      if (contrast.length) failures.push({ theme, file, contrast });
      if (file === '/about.html') {
        for (const paragraph of await page.locator('.about-page section p:not(.about-section-number) + p').all()) {
          assert.ok(await paragraph.evaluate(el => parseFloat(getComputedStyle(el).marginTop) >= 20), 'About paragraphs retain a visible paragraph break');
        }
      }
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        // Stress browser font preferences, then WCAG text-spacing overrides.
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 16).map(el => `${el.tagName}.${el.className}`));
        assert.deepEqual(overflow, [], `${theme} ${width}px enlarged text overflows ${file}`);
        await page.addStyleTag({ content: 'html { font-size: 100% !important; } :is(.notes-home, .about-page, .typst-article) :is(p, h2, h3, a) { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } :is(.notes-home, .about-page, .typst-article) p { margin-bottom: 2em !important; }' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${width}px text spacing overflows ${file}`);
      }
    }
  }
  assert.deepEqual(failures, [], 'Sampled normal text must reach 4.5:1 contrast');
  await page.goto(`https://notes.test${subjectPage}`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = page.locator('.note-card').first();
  await card.locator('h3 a').focus();
  assert.equal(await card.evaluate(el => getComputedStyle(el).transform), 'none');
  assert.ok(await card.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2));
  console.log('Readability checks passed: sampled contrast on home/index/subject/note pages, 200% root text, text spacing, reduced motion and card focus.');
} finally { await browser.close(); }
