import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';

export async function validateRelease(root, notes, origin = 'https://zzjrabbit.github.io', staticPages = []) {
  const files = ['index.html', '404.html', ...staticPages, ...notes.map(n => n.file)];
  const pages = new Map(await Promise.all(files.map(async file =>
    [file, load(await readFile(path.join(root, file), 'utf8'))])));
  const canonicalURLs = [];
  for (const [file, $] of pages) {
    assert.equal($('h1').length, 1, `${file}: one h1`);
    assert.ok($('title').text().trim(), `${file}: title`);
    assert.ok($('meta[name="description"]').attr('content')?.trim(), `${file}: description`);
    const expected = `${origin}/${file === 'index.html' ? '' : file}`;
    if (file !== '404.html') {
      assert.equal($('link[rel="canonical"]').attr('href'), expected, `${file}: canonical URL`);
      canonicalURLs.push(expected);
    }
    if (file === '404.html') assert.ok($('meta[name="robots"]').attr('content')?.includes('noindex'), '404 must not be indexed');
    const ids = $('[id]').toArray().map(el => $(el).attr('id'));
    assert.equal(new Set(ids).size, ids.length, `${file}: unique IDs`);
    for (const el of $('a[href],link[href],script[src],img[src],image[href],source[src],video[src],audio[src]').toArray()) {
      const href = $(el).attr('href') || $(el).attr('src');
      if (!href) continue;
      const url = new URL(href, `${origin}/${file}`);
      if (url.origin !== origin) continue;
      let target = decodeURIComponent(url.pathname).slice(1);
      if (!target || target.endsWith('/')) target += 'index.html';
      assert.ok(!target.split('/').includes('..'), `${file}: unsafe path ${href}`);
      await access(path.join(root, target)).catch(() => { throw new Error(`${file}: missing resource ${href}`); });
      if (url.hash && pages.has(target)) {
        const id = decodeURIComponent(url.hash.slice(1));
        const dest = pages.get(target);
        assert.ok(dest('[id]').toArray().some(node => dest(node).attr('id') === id), `${file}: missing anchor ${href}`);
      }
    }
  }
  const index = load(await readFile(path.join(root, 'sitemap-index.xml'), 'utf8'), { xmlMode: true });
  const sitemapURLs = [];
  for (const node of index('sitemap > loc').toArray()) {
    const url = new URL(index(node).text());
    assert.equal(url.origin, origin);
    const sitemap = load(await readFile(path.join(root, url.pathname.slice(1)), 'utf8'), { xmlMode: true });
    sitemapURLs.push(...sitemap('url > loc').toArray().map(el => sitemap(el).text()));
  }
  assert.deepEqual(sitemapURLs.sort(), canonicalURLs.sort(), 'sitemap matches public canonical URLs');
  assert.ok((await readFile(path.join(root, 'robots.txt'), 'utf8')).includes(`Sitemap: ${origin}/sitemap-index.xml`));
}
