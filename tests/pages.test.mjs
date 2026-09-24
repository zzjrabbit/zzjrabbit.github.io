import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * The exclusion patterns in `site/calepin.toml`, in order.
 *
 * TOML is not parsed here: the file is hand-written and only ever holds this one
 * flat array of strings, so comments are stripped and the quoted values read.
 */
function excludePatterns(config) {
  const lines = config.split('\n');
  const start = lines.findIndex(line => line.trim() === '[pages]');
  assert.ok(start >= 0, 'site/calepin.toml must keep a [pages] section');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    body.push(line.replace(/#.*$/, ''));
  }
  return [...body.join('\n').matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

/** Glob matching as Calepin uses it: `*` stays inside a segment, `**` spans them. */
function matches(pattern, file) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${source}$`).test(file);
}

/** The collections `scripts/sync-notes.sh` copies into `site/`. */
function syncedRoots(syncScript) {
  const loop = /for d in ([^;]+); do/.exec(syncScript);
  assert.ok(loop, 'scripts/sync-notes.sh must keep its collection loop');
  return loop[1].trim().split(/\s+/);
}

test('every synced collection excludes its shared.typ library from pages', async () => {
  const exclude = excludePatterns(await readFile('site/calepin.toml', 'utf8'));
  const roots = syncedRoots(await readFile('scripts/sync-notes.sh', 'utf8'));
  assert.deepEqual(roots, ['typ', 'phys', 'physics', 'models', 'lean']);

  // `lean/` holds Lean sources, so no Typst page can be compiled from it.
  for (const root of roots.filter(root => root !== 'lean')) {
    const library = `${root}/shared.typ`;
    assert.ok(
      exclude.some(pattern => matches(pattern, library)),
      `${library} must be excluded by site/calepin.toml [pages].exclude: Calepin would publish it as a title-less page and the build would stop`,
    );
  }

  // The matcher above must fail on both sides: theme files are not pages, but no
  // pattern may ever swallow a real note.
  assert.ok(exclude.some(pattern => matches(pattern, 'themes/site/notes.typ')));
  assert.ok(!exclude.some(pattern => matches(pattern, 'typ/topology/continuous.typ')));
  assert.ok(!exclude.some(pattern => matches(pattern, 'phys/dynamics/sling.typ')));
});
