import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateRelease } from '../scripts/validate-release.mjs';

test('release gate catches missing head assets, anchors and conflicting sitemap URLs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'notes-release-'));
  const origin = 'https://zzjrabbit.github.io';
  const page = extra => `<html><head><title>Notes</title><meta name="description" content="Notes"><link rel="canonical" href="${origin}/">${extra}</head><body><h1>Notes</h1></body></html>`;
  const put = (file, data) => writeFile(path.join(root, file), data);
  try {
    await put('index.html', page(''));
    await put('404.html', page('<meta name="robots" content="noindex, follow">'));
    await put('sitemap-index.xml', `<sitemapindex><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap></sitemapindex>`);
    await put('sitemap-0.xml', `<urlset><url><loc>${origin}/</loc></url></urlset>`);
    await put('robots.txt', `Sitemap: ${origin}/sitemap-index.xml`);
    await validateRelease(root, []);
    await put('index.html', page('<link rel="icon" href="/missing.svg">'));
    await assert.rejects(validateRelease(root, []), /missing resource/);
    await put('index.html', page('<a href="#missing">Jump</a>'));
    await assert.rejects(validateRelease(root, []), /missing anchor/);
    await put('index.html', page(''));
    await put('sitemap-0.xml', `<urlset><url><loc>${origin}/index.html</loc></url></urlset>`);
    await assert.rejects(validateRelease(root, []), /sitemap matches/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
