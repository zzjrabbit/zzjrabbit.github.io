/**
 * The notebook model: which subjects exist, how they are labelled, ordered and
 * linked, and how the sidebar and index pages are built from them.
 *
 * Everything is derived from `.generated/notes.json` (written by
 * `scripts/prepare-starlight.mjs`), so a new folder in the notes repository
 * becomes a real subject of this site — home card, index section, subject page
 * and sidebar group — without editing this website.
 *
 * Deliberately plain ESM with no Astro and no file reads at import time:
 * `astro.config.mjs` (Node) and the Astro pages both import it.
 */

/**
 * Curated presentation for the subjects that exist today: display label, one
 * sentence of context and the order they are shown in. Directories that are not
 * listed here are still published automatically, with a label derived from the
 * directory name, so this table is polish rather than a gate.
 *
 * A notes directory can also describe itself in `subject.json`
 * (for example `typ/functional-analysis/subject.json`), which wins over this
 * table; see `README.md`.
 */
export const SUBJECT_REGISTRY = [
  { key: 'typ/real', label: 'Real analysis', blurb: 'Limits, continuity and the structure of the real line, with the counterexamples that shape them.' },
  { key: 'typ/topology', label: 'Topology', blurb: 'Open sets, continuity and the invariants that survive deformation.' },
  { key: 'typ/geometry', label: 'Geometry', blurb: 'Differential forms, curvature and the calculus of smooth spaces.' },
  { key: 'typ/lie', label: 'Lie theory', blurb: 'Groups, their linearizations, and the symmetry behind functional equations.' },
  { key: 'models', label: 'Mathematical modeling', blurb: 'Small optimisation and simulation models, with their assumptions stated up front.' },
];

/** Published pages that sit outside any subject folder are collected here. */
const OTHER_KEY = 'other';
const OTHER_LABEL = 'Other notes';
/** How many notes the home page lists under "Recently added". */
export const RECENT_LIMIT = 5;
/** Above this many notes a sidebar group starts collapsed. */
const SIDEBAR_OPEN_LIMIT = 8;
export const ALL_NOTES_PATH = '/notes.html';
export const ABOUT_PATH = '/about.html';
export const subjectHref = subject => `/subjects/${subject.slug}.html`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The subject a published page belongs to, derived from its repository path:
 * `typ/topology/continuous.html` → `typ/topology`, `models/cafeteria/note.html`
 * → `models`. The notes repository layout is the only thing that decides this.
 */
export function subjectKey(file) {
  const segments = String(file).replace(/\.html$/, '').split('/');
  if (segments.length < 2) return OTHER_KEY;
  return segments[0] === 'typ' ? `typ/${segments[1]}` : segments[0];
}

/** Readable label for a subject nobody has described yet. */
export function autoSubjectLabel(key) {
  if (key === OTHER_KEY) return OTHER_LABEL;
  const name = String(key).split('/').pop().replace(/[-_]+/g, ' ').trim();
  if (!name) return OTHER_LABEL;
  // A folder written in capitals is an acronym the author already decided on
  // (`typ/PDE/` → PDE), and short vowel-free names read as one (`nlp` → NLP).
  if (!/[a-z]/.test(name) && /[A-Z]/.test(name)) return name;
  if (/^[a-z]{2,5}$/.test(name) && !/[aeiou]/.test(name)) return name.toUpperCase();
  return name[0].toUpperCase() + name.slice(1);
}

export function slugify(value) {
  return String(value).normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

/** Newest first; undated notes stay last, ties fall back to the title. */
export function compareNotes(a, b) {
  const left = a.date || '';
  const right = b.date || '';
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return left < right ? 1 : -1;
  }
  return String(a.title).localeCompare(String(b.title));
}

/** `2026-08-11` → `11 Aug 2026`; anything unparsable is passed through. */
export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return String(value || '');
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A unique URL segment: the subject's own folder name, qualified if taken. */
function uniqueSlug(key, taken) {
  const segments = key.split('/');
  const last = segments[segments.length - 1];
  const candidates = [...new Set([slugify(last), slugify(`${segments[0]}-${last}`)])];
  for (const candidate of candidates) {
    if (candidate && !taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const base = candidates.find(Boolean) || 'subject';
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  taken.add(`${base}-${suffix}`);
  return `${base}-${suffix}`;
}

/**
 * Build the whole notebook from the published notes: subjects in display order,
 * every note newest first, and the short "recently added" list for the home
 * page. `manifests` maps a subject key to the optional `subject.json` contents.
 */
export function buildLibrary(notes, manifests = {}) {
  const registry = new Map(SUBJECT_REGISTRY.map((entry, index) => [entry.key, { ...entry, order: index }]));
  const grouped = new Map();
  for (const note of notes) {
    const key = subjectKey(note.file);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(note);
  }
  const taken = new Set();
  // Shallower keys claim the plain URL segment first (`models/` → /subjects/models.html,
  // then `typ/models/` → /subjects/typ-models.html).
  const entries = [...grouped.entries()]
    .sort(([left], [right]) => left.split('/').length - right.split('/').length || left.localeCompare(right));
  const subjects = entries.map(([key, list]) => {
    const manifest = isPlainObject(manifests?.[key]) ? manifests[key] : {};
    const curated = registry.get(key) || {};
    const label = typeof manifest.label === 'string' && manifest.label.trim() ? manifest.label.trim()
      : curated.label || autoSubjectLabel(key);
    const blurb = typeof manifest.blurb === 'string' && manifest.blurb.trim() ? manifest.blurb.trim()
      : curated.blurb || '';
    const order = Number.isFinite(manifest.order) ? manifest.order
      : (key === OTHER_KEY ? Number.MAX_SAFE_INTEGER : curated.order ?? SUBJECT_REGISTRY.length);
    const sorted = [...list].sort(compareNotes);
    const slug = uniqueSlug(key, taken);
    return {
      key, slug, label, blurb, order,
      href: subjectHref({ slug }),
      notes: sorted,
      count: sorted.length,
      latest: sorted[0] || null,
      updated: sorted.find(note => note.date)?.date || '',
    };
  });
  subjects.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  const ordered = [...notes].sort(compareNotes);
  return {
    notes: ordered,
    subjects,
    recent: ordered.slice(0, RECENT_LIMIT),
    total: ordered.length,
    byFile: Object.fromEntries(subjects.flatMap(subject => subject.notes.map(note => [note.file, subject]))),
  };
}

/** The subject of one published page, for the note page's own context line. */
export function subjectOf(library, file) {
  return library.byFile[file] || null;
}

/** Starlight sidebar: one group per subject, generated from the same library. */
export function sidebar(library) {
  return [
    {
      label: 'Notebook',
      items: [
        { label: 'Overview', link: '/' },
        { label: 'All notes', link: ALL_NOTES_PATH },
        { label: 'About', link: ABOUT_PATH },
      ],
    },
    ...library.subjects.map(subject => ({
      label: subject.label,
      collapsed: subject.count > SIDEBAR_OPEN_LIMIT,
      items: subject.notes.map(note => ({ label: note.title, link: `/${note.file}` })),
    })),
  ];
}
