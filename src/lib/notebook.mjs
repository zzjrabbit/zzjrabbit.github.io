/**
 * The notebook model: which tracks and subjects exist, how they are labelled,
 * ordered and linked, and how the sidebar and index pages are built from them.
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
 * The parallel tracks of the notebook. Mathematics and physics are the two
 * main lines of the notebook and are presented side by side; computational
 * modeling is the third, smaller line. Every track is always published, even
 * while it is still empty, so a track that is being built up is visible from
 * its first day instead of appearing later.
 */
export const TRACK_REGISTRY = [
  { key: 'mathematics', label: 'Mathematics', blurb: 'Structure, space and change, developed from definition to proof.' },
  { key: 'physics', label: 'Physics', blurb: 'Mechanics, fields and quanta, with the mathematics each of them demands.' },
  { key: 'modeling', label: 'Modeling & computation', blurb: 'Optimisation, simulation and numerical models, with every assumption stated up front.' },
];

/** A subject nobody has placed anywhere belongs to the first track. */
export const DEFAULT_TRACK = 'mathematics';

/**
 * Which track a directory belongs to, decided by the notes repository layout
 * alone. Every collection root is placed explicitly: `typ/…` is mathematics,
 * `phys/…` (or `physics/…`) is its physics twin, and the top-level `models/`
 * collection is the computational modeling line. Because `typ/` is listed here,
 * nothing but that directory's own `subject.json` can move a mathematics
 * subject out of the mathematics track.
 */
const TRACK_ROOTS = { typ: 'mathematics', phys: 'physics', physics: 'physics', models: 'modeling' };

/**
 * Folder names that read as physics. This only reaches collections that sit
 * outside every root above — a top-level `mechanics/`, say — because a layout
 * root is decided before any name is inspected, and `typ/` is a layout root.
 * It is the last resort before the default track, and `prepare-starlight.mjs`
 * prints the subjects that needed a guess. Matched on whole words only, so
 * `statistical-learning` stays mathematics.
 */
const PHYSICS_TERMS = [
  'physics', 'phys', 'mechanics', 'quantum', 'electrodynamics', 'electromagnetism',
  'relativity', 'thermodynamics', 'statistical-mechanics', 'field-theory', 'optics',
  'condensed-matter', 'solid-state', 'particle', 'cosmology', 'astrophysics',
  'plasma', 'nuclear', 'atomic', 'fluid-dynamics', 'waves', 'gravity', 'gravitation',
  'photonics', 'superconductivity',
];

/**
 * Curated presentation for the subjects that exist today: display label, one
 * sentence of context and the order they are shown in. Directories that are not
 * listed here are still published automatically, with a label derived from the
 * directory name, so this table is polish rather than a gate — but the one-line
 * blurb has no automatic source, so an unlisted subject simply shows none
 * (see `blurb` in `buildLibrary`).
 *
 * A notes directory can also describe itself in `subject.json`
 * (for example `typ/functional-analysis/subject.json`), which wins over this
 * table; see `README.md`. An optional `track` on an entry here places a subject
 * that neither its own manifest nor its location places.
 */
export const SUBJECT_REGISTRY = [
  { key: 'typ/real', label: 'Real analysis', blurb: 'Limits, continuity and the structure of the real line, with the counterexamples that shape them.' },
  { key: 'typ/topology', label: 'Topology', blurb: 'Open sets, continuity and the invariants that survive deformation.' },
  { key: 'typ/geometry', label: 'Geometry', blurb: 'Differential forms, curvature and the calculus of smooth spaces.' },
  { key: 'typ/lie', label: 'Lie theory', blurb: 'Groups, their linearizations, and the symmetry behind functional equations.' },
  { key: 'typ/inequalities', label: 'Inequalities', blurb: 'Comparisons and bounds between quantities, and the estimates that make each one rigorous.' },
  { key: 'models', label: 'Mathematical modeling', blurb: 'Small optimisation and simulation models, with their assumptions stated up front.' },
  { key: 'phys/dynamics', label: 'Dynamics', blurb: 'Forces, momentum and energy, and how an equation of motion is set up and solved.' },
  { key: 'phys/statics', label: 'Statics', blurb: 'Equilibrium of forces and moments, and the conditions under which nothing moves.' },
  { key: 'phys/kinematics', label: 'Kinematics', blurb: 'Position, velocity and acceleration described first, before asking what causes the motion.' },
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
/** Every track has a landing page, including one that has no notes yet. */
export const trackHref = track => `/tracks/${track.key}.html`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Collection roots whose second path segment names the subject. */
const TWO_LEVEL_ROOTS = new Set(['typ', 'phys', 'physics']);

/**
 * The subject a published page belongs to, derived from its repository path:
 * `typ/topology/continuous.html` → `typ/topology`, `phys/quantum/…` →
 * `phys/quantum`, `models/cafeteria/note.html` → `models`. The notes repository
 * layout is the only thing that decides this.
 */
export function subjectKey(file) {
  const segments = String(file).replace(/\.html$/, '').split('/');
  if (segments.length < 2) return OTHER_KEY;
  return TWO_LEVEL_ROOTS.has(segments[0]) ? `${segments[0]}/${segments[1]}` : segments[0];
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

/**
 * The track key a declared value stands for: a `track` in `subject.json` may be
 * written either as the key (`physics`) or as the published label (`Physics`).
 * Anything else is reported as unknown so it can be warned about instead of
 * published as an unlabelled track.
 */
export function normaliseTrackKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const wanted = slugify(value);
  const entry = TRACK_REGISTRY.find(track => track.key === wanted || slugify(track.label) === wanted);
  return entry ? entry.key : null;
}

/**
 * The folder-derived physics guess, used only after a manifest and the layout
 * roots have had their say. Whole words only: `quantum-mechanics` and
 * `solid-state-physics` qualify, `statistical-learning` does not.
 */
function inferredTrack(key) {
  const name = slugify(String(key).split('/').pop());
  if (!name) return null;
  const words = name.split('-');
  return words.some(word => PHYSICS_TERMS.includes(word)) ? 'physics' : null;
}

/**
 * Which track a subject belongs to, and how that was decided:
 *
 *   1. `track` in that directory's own `subject.json` — authoritative, written
 *      in the notes repository, so this website maintains no classification.
 *      This is the only way a `typ/` subject can leave the mathematics track.
 *   2. The repository layout: `typ/…` is mathematics, `phys/…` is physics, and
 *      the `models/` collection is the modeling line.
 *   3. An optional `track` on the subject's entry in `SUBJECT_REGISTRY`, which
 *      can only matter for a collection outside every layout root.
 *   4. A physics-looking folder name (see `PHYSICS_TERMS`), again only outside
 *      those roots.
 *   5. Otherwise `DEFAULT_TRACK`.
 *
 * The `source` is kept so `scripts/prepare-starlight.mjs` can point at the
 * subjects that were only guessed at rather than deliberately placed.
 */
export function resolveTrack(key, manifest = {}, curated = {}) {
  const declared = normaliseTrackKey(manifest?.track);
  if (declared) return { key: declared, source: 'manifest' };
  const root = TRACK_ROOTS[String(key).split('/')[0]];
  if (root) return { key: root, source: 'layout' };
  const registered = normaliseTrackKey(curated?.track);
  if (registered) return { key: registered, source: 'registry' };
  const guessed = inferredTrack(key);
  if (guessed) return { key: guessed, source: 'inferred' };
  return { key: DEFAULT_TRACK, source: 'default' };
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
 * Build the whole notebook from the published notes: the parallel tracks,
 * the subjects in display order, every note newest first, and the short
 * "recently added" list for the home page. `manifests` maps a subject key to
 * the optional `subject.json` contents.
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
    const track = resolveTrack(key, manifest, curated);
    return {
      key, slug, label, blurb, order, track,
      href: subjectHref({ slug }),
      notes: sorted,
      count: sorted.length,
      latest: sorted[0] || null,
      updated: sorted.find(note => note.date)?.date || '',
    };
  });
  subjects.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  const ordered = [...notes].sort(compareNotes);
  // Every registered track is published, empty or not: the physics line is part
  // of the notebook from the beginning even before its first note is written.
  const tracks = TRACK_REGISTRY.map((track, index) => {
    const members = subjects.filter(subject => subject.track.key === track.key);
    const memberNotes = members.flatMap(subject => subject.notes).sort(compareNotes);
    return {
      key: track.key, label: track.label, blurb: track.blurb, order: index,
      href: trackHref(track),
      subjects: members,
      count: memberNotes.length,
      subjectCount: members.length,
      latest: memberNotes[0] || null,
      updated: memberNotes.find(note => note.date)?.date || '',
    };
  });
  return {
    notes: ordered,
    subjects,
    tracks,
    recent: ordered.slice(0, RECENT_LIMIT),
    total: ordered.length,
    byFile: Object.fromEntries(subjects.flatMap(subject => subject.notes.map(note => [note.file, subject]))),
  };
}

/** The subject of one published page, for the note page's own context line. */
export function subjectOf(library, file) {
  return library.byFile[file] || null;
}

/** The track of one published page, for the note page's own context line. */
export function trackOf(library, file) {
  const subject = subjectOf(library, file);
  return subject ? library.tracks.find(track => track.key === subject.track.key) || null : null;
}

/**
 * Starlight sidebar: one group per track, one nested group per subject inside
 * it, generated from the same library the pages use. A track with no notes yet
 * keeps its place and links to its own landing page instead of disappearing.
 */
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
    ...library.tracks.map(track => ({
      label: track.label,
      collapsed: false,
      ...(track.count ? { badge: { text: String(track.count), class: 'track-count' } } : {}),
      items: track.subjects.length
        ? track.subjects.map(subject => ({
            label: subject.label,
            collapsed: subject.count > SIDEBAR_OPEN_LIMIT,
            items: subject.notes.map(note => ({ label: note.title, link: `/${note.file}` })),
          }))
        : [{ label: 'No notes yet', link: track.href, attrs: { class: 'track-empty' } }],
    })),
  ];
}
