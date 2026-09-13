import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

export function extractNote(html, file) {
  const $ = load(html);
  const main = $('main.calepin-website-main');
  if (main.length !== 1) throw new Error(`${file}: expected one Calepin article`);
  const title = main.find('h1').first().text();
  if (!title) throw new Error(`${file}: missing title`);
  // Keep the original fragment ID as existing bookmarks may point to it.
  main.find('h1').first().replaceWith($('<span>').attr('id', main.find('h1').first().attr('id') || 'original-title'));
  const headings = main.find('h2,h3').toArray().map((el, i) => {
    const node = $(el);
    const slug = node.attr('id') || `section-${i + 1}`;
    node.attr('id', slug);
    return { depth: Number(el.tagName.slice(1)), slug, text: node.text() };
  });
  // Starlight's generic sibling spacing also matches MathML nodes (scripts,
  // fractions, matrix cells). Opt only math out; retain Typst's math CSS and
  // Starlight typography for the surrounding article. Do this at build time
  // so native math remains correct before JS runs and with JS disabled.
  main.find('math').addClass('not-content');
  // Typst diagrams use literal black for glyphs and outlines. Let that ink
  // inherit the article theme; preserve semantic colors, transparent paint,
  // and mask luminance. No inversion filter (which would distort colors).
  main.find('svg').addClass('note-diagram not-content').each((_, svg) => {
    $(svg).find('*').addBack().each((_, el) => {
      const node = $(el);
      if (node.is('mask') || node.parents('mask').length) return;
      for (const paint of ['fill', 'stroke']) {
        if (/^(?:#000(?:000)?|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(node.attr(paint) || '')) {
          node.attr(paint, 'currentColor');
        }
      }
    });
  });
  // Serialize the body as HTML, never pass MathML/SVG through Markdown or MDX.
  return { file, title, description: $('meta[name="description"]').attr('content') || '',
    html: main.html(), headings, mathCSS: $('head > style').first().text(),
    source: JSON.parse($('#calepin-website-source-data').text() || '""') };
}

// Match the full subject-relative path, never just the basename. A companion
// file is a source reference, not a claim that every result is formalized.
export function leanSourceFor(file, leanFiles) {
  if (!file.startsWith('typ/') || !file.endsWith('.html')) return null;
  const lean = file.replace(/^typ\//, 'lean/').replace(/\.html$/, '.lean');
  return leanFiles.has(lean)
    ? `https://github.com/zzjrabbit/notes/blob/main/${lean.split('/').map(encodeURIComponent).join('/')}`
    : null;
}

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.posix.join(base, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), file));
    else out.push(file);
  }
  return out.sort();
}

async function prepare() {
  const input = '_calepin';
  const files = await walk(input);
  // Calepin does not publish Lean sources; discover the synchronized repository
  // files directly and link to GitHub's readable, syntax-highlighted source.
  const leanFiles = new Set((await walk('site')).filter(file => file.startsWith('lean/') && file.endsWith('.lean')));
  await rm('.generated', { recursive: true, force: true });
  await mkdir('.generated/public', { recursive: true });
  const notes = [];
  for (const file of files) {
    if (file.endsWith('.html')) {
      if (file === 'index.html' || file === '404.html') continue;
      const note = extractNote(await readFile(path.join(input, file), 'utf8'), file);
      const pdf = file.replace(/\.html$/, '.pdf');
      if (!files.includes(pdf)) throw new Error(`Missing PDF: ${pdf}`);
      notes.push({ ...note, leanSource: leanSourceFor(file, leanFiles) });
    } else if (!file.startsWith('pagefind/') && !file.startsWith('.calepin/') && !['sitemap.xml', 'robots.txt', 'atom.xml', 'index.typ', '404.typ'].includes(file)) {
      const dest = path.join('.generated/public', file);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(path.join(input, file), dest);
    }
  }
  if (!notes.length) throw new Error('No compiled notes; run scripts/build.sh first');
  // Hand-maintained public assets survive regeneration of the staging directory.
  await cp('public', '.generated/public', { recursive: true });
  await writeFile('.generated/notes.json', JSON.stringify(notes));
  console.log(`Prepared ${notes.length} Typst articles for Starlight`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/prepare-starlight.mjs')) await prepare();
