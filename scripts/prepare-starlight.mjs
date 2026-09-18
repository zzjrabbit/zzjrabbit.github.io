import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { buildLibrary, normaliseTrackKey, subjectKey, TRACK_REGISTRY } from '../src/lib/notebook.mjs';

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
// `phys/` mirrors into `lean/` exactly as `typ/` does, so a physics note keeps
// the same relative path in both repositories' collections.
export function leanSourceFor(file, leanFiles) {
  if (!file.endsWith('.html')) return null;
  const mirrored = /^(?:typ|phys)\//.test(file) ? file.replace(/^(?:typ|phys)\//, 'lean/') : null;
  if (!mirrored) return null;
  const lean = mirrored.replace(/\.html$/, '.lean');
  return leanFiles.has(lean)
    ? `https://github.com/zzjrabbit/notes/blob/main/${lean.split('/').map(encodeURIComponent).join('/')}`
    : null;
}

/** Index just past the bracket opened at `start`, ignoring brackets inside strings. */
function skipBalanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      i = skipString(text, i) - 1;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Index just past the string literal starting at `start`, plus its value. */
function readString(text, start) {
  let value = '';
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      const escapes = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
      value += escapes[text[i + 1]] ?? text[i + 1];
      i += 1;
    } else if (char === '"') {
      return [value, i + 1];
    } else {
      value += char;
    }
  }
  return [value, text.length];
}

const skipString = (text, start) => readString(text, start)[1];

/** Read the literal arguments of a Typst call body, ignoring nested calls. */
function readLiteralArguments(text) {
  const values = {};
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      i = skipString(text, i) - 1;
      continue;
    }
    if ('([{'.includes(char)) {
      depth += 1;
      continue;
    }
    if (')]}'.includes(char)) {
      depth -= 1;
      continue;
    }
    if (depth !== 0 || !/[A-Za-z_]/.test(char)) continue;
    const name = /^[A-Za-z0-9_]+/.exec(text.slice(i))[0];
    let cursor = i + name.length;
    while (/\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] !== ':') {
      i += name.length - 1;
      continue;
    }
    cursor += 1;
    while (/\s/.test(text[cursor])) cursor += 1;
    const literal = readLiteral(text, cursor);
    if (literal) values[name] = literal.value;
    i = (literal ? literal.next : cursor) - 1;
  }
  return values;
}

/** A string or a parenthesised list of strings; anything computed is skipped. */
function readLiteral(text, index) {
  if (text[index] === '"') {
    const [value, next] = readString(text, index);
    return { value, next };
  }
  if (text[index] !== '(' && text[index] !== '[') return null;
  const end = skipBalanced(text, index);
  if (end < 0) return { value: null, next: text.length };
  const items = [];
  let cursor = index + 1;
  while (cursor < end - 1) {
    const char = text[cursor];
    if (/[\s,]/.test(char)) cursor += 1;
    else if (char === '"') {
      const [item, next] = readString(text, cursor);
      items.push(item);
      cursor = next;
    } else return { value: null, next: end };
  }
  return { value: items, next: end };
}

/**
 * The site metadata a note declares through `#show: tylenotes.with(...)`.
 *
 * Calepin publishes the same values in its own page index; reading them from the
 * note's published source as well keeps this bridge working — and testable —
 * even when that internal cache changes shape. `tylenotes` only accepts string
 * literals, so anything computed is ignored instead of guessed at.
 */
export function parseSiteMetadata(source) {
  const text = String(source || '');
  const call = text.search(/#show:\s*tylenotes\.with\s*\(/);
  if (call < 0) return {};
  const open = text.indexOf('(', call);
  const end = skipBalanced(text, open);
  if (end < 0) return {};
  const values = readLiteralArguments(text.slice(open + 1, end - 1));
  const meta = {};
  for (const key of ['title', 'date', 'summary']) {
    if (typeof values[key] === 'string' && values[key].trim()) meta[key] = values[key].trim();
  }
  const tags = normaliseTags(values.tags);
  if (tags.length) meta.tags = tags;
  return meta;
}

/** Tags may be declared as `("a", "b")` or as a single string. */
export function normaliseTags(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim());
}

/**
 * Calepin's own page index, which is the structured copy of the site metadata.
 * It is a build cache inside the source tree, so every lookup falls back to the
 * note source when it is unavailable.
 */
async function readCalepinMetadata() {
  try {
    const pages = JSON.parse(await readFile('site/.calepin/website-pages.json', 'utf8'));
    if (!Array.isArray(pages)) return new Map();
    return new Map(pages.filter(page => page?.path).map(page => [page.path, page.meta || {}]));
  } catch {
    return new Map();
  }
}

/**
 * Optional `subject.json` manifests let a notes directory describe its own
 * section (label, blurb, order, and the track it belongs to) without touching
 * this repository. The file sits in the directory that names the subject:
 * `typ/<subject>/`, `phys/<subject>/` or `models/`.
 */
async function readSubjectManifests(files) {
  const manifests = {};
  for (const file of files) {
    if (path.posix.basename(file) !== 'subject.json') continue;
    const key = path.posix.dirname(file);
    if (key === '.') continue;
    try {
      const value = JSON.parse(await readFile(path.join('site', file), 'utf8'));
      if (value && typeof value === 'object' && !Array.isArray(value)) manifests[key] = value;
      else console.warn(`Ignoring ${file}: expected a JSON object`);
    } catch (error) {
      console.warn(`Ignoring ${file}: ${error.message}`);
    }
  }
  return manifests;
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
  const siteFiles = await walk('site');
  // Calepin does not publish Lean sources; discover the synchronized repository
  // files directly and link to GitHub's readable, syntax-highlighted source.
  const leanFiles = new Set(siteFiles.filter(file => file.startsWith('lean/') && file.endsWith('.lean')));
  const pageMeta = await readCalepinMetadata();
  const subjectManifests = await readSubjectManifests(siteFiles);
  await rm('.generated', { recursive: true, force: true });
  await mkdir('.generated/public', { recursive: true });
  const notes = [];
  for (const file of files) {
    if (file.endsWith('.html')) {
      if (file === 'index.html' || file === '404.html') continue;
      const note = extractNote(await readFile(path.join(input, file), 'utf8'), file);
      const pdf = file.replace(/\.html$/, '.pdf');
      if (!files.includes(pdf)) throw new Error(`Missing PDF: ${pdf}`);
      // Site metadata: prefer Calepin's structured index, fall back to the
      // metadata call in the published note source.
      const declared = { ...parseSiteMetadata(note.source), ...pageMeta.get(file.replace(/\.html$/, '.typ')) };
      const date = typeof declared.date === 'string' ? declared.date : '';
      if (!date) console.warn(`No date declared for ${file}; it will be filed last`);
      notes.push({
        ...note,
        path: file.replace(/\.html$/, '.typ'),
        date,
        tags: normaliseTags(declared.tags),
        leanSource: leanSourceFor(file, leanFiles),
      });
    } else if (!file.startsWith('pagefind/') && !file.startsWith('.calepin/') && !['sitemap.xml', 'robots.txt', 'atom.xml', 'index.typ', '404.typ'].includes(file)) {
      const dest = path.join('.generated/public', file);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(path.join(input, file), dest);
    }
  }
  if (!notes.length) throw new Error('No compiled notes; run scripts/build.sh first');
  for (const key of Object.keys(subjectManifests)) {
    if (!notes.some(note => subjectKey(note.file) === key)) console.warn(`Ignoring site/${key}/subject.json: no published note belongs to that subject`);
  }
  // Which track a subject belongs to is decided in the notes repository: a
  // `track` in its own subject.json, the phys/ and models/ roots, or a
  // physics-looking folder name. Report the guesses and refuse track values this
  // site cannot label, so a typo never turns into a silent misfiling.
  const trackKeys = TRACK_REGISTRY.map(track => track.key).join(', ');
  for (const [key, manifest] of Object.entries(subjectManifests)) {
    if (manifest.track !== undefined && !normaliseTrackKey(manifest.track)) {
      console.warn(`Ignoring track ${JSON.stringify(manifest.track)} in site/${key}/subject.json: expected one of ${trackKeys}`);
    }
  }
  for (const subject of buildLibrary(notes, subjectManifests).subjects) {
    if (subject.track.source === 'inferred') {
      console.warn(`Filing ${subject.key} under the ${subject.track.key} track by folder name; add "track": "${subject.track.key}" to its subject.json to make that explicit`);
    }
  }
  // Hand-maintained public assets survive regeneration of the staging directory.
  await cp('public', '.generated/public', { recursive: true });
  await writeFile('.generated/notes.json', JSON.stringify(notes));
  await writeFile('.generated/subjects.json', JSON.stringify(subjectManifests, null, 1));
  console.log(`Prepared ${notes.length} Typst articles for Starlight`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/prepare-starlight.mjs')) await prepare();
