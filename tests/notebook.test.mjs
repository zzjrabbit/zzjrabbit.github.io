import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_NOTES_PATH, autoSubjectLabel, buildLibrary, compareNotes,
  formatDate, sidebar, slugify, subjectHref, subjectKey, subjectOf,
} from '../src/lib/notebook.mjs';

const note = (file, extra = {}) => ({ file, title: file, description: '', date: '', tags: [], ...extra });

test('a subject is derived from the notes repository path, never from a list', () => {
  assert.equal(subjectKey('typ/topology/continuous.html'), 'typ/topology');
  assert.equal(subjectKey('typ/functional-analysis/sobolev.html'), 'typ/functional-analysis');
  assert.equal(subjectKey('models/cafeteria/note.html'), 'models');
  assert.equal(subjectKey('essays/on-proof.html'), 'essays');
  assert.equal(subjectKey('colophon.html'), 'other');
});

test('an unregistered subject still gets a readable label', () => {
  assert.equal(autoSubjectLabel('typ/functional-analysis'), 'Functional analysis');
  assert.equal(autoSubjectLabel('typ/nlp'), 'NLP');
  // A folder written in capitals is an acronym its author already chose.
  assert.equal(autoSubjectLabel('typ/PDE'), 'PDE');
  assert.equal(autoSubjectLabel('other'), 'Other notes');
  assert.equal(slugify('Functional analysis'), 'functional-analysis');
});

test('every published note lands in a subject, with no leftover bucket', () => {
  const library = buildLibrary([
    note('typ/topology/continuous.html', { date: '2026-08-11' }),
    note('typ/functional-analysis/sobolev.html', { date: '2026-09-02' }),
    note('models/cafeteria/note.html', { date: '2026-09-01' }),
    note('colophon.html'),
  ]);
  assert.deepEqual(library.subjects.map(subject => subject.key), ['typ/topology', 'models', 'typ/functional-analysis', 'other']);
  assert.deepEqual(library.subjects.map(subject => subject.label), ['Topology', 'Mathematical modeling', 'Functional analysis', 'Other notes']);
  assert.equal(library.subjects.every(subject => subject.count > 0), true);
  assert.equal(library.byFile['typ/functional-analysis/sobolev.html'].count, 1);
  assert.equal(subjectOf(library, 'colophon.html').key, 'other');
  assert.equal(subjectOf(library, 'missing.html'), null);
});

test('notes are ordered newest first and undated notes are filed last', () => {
  const library = buildLibrary([
    note('typ/topology/a.html', { title: 'A', date: '2026-08-11' }),
    note('typ/topology/b.html', { title: 'B', date: '2026-09-02' }),
    note('typ/topology/c.html', { title: 'C' }),
    note('typ/topology/d.html', { title: 'D', date: '2026-08-11' }),
  ]);
  assert.deepEqual(library.subjects[0].notes.map(item => item.title), ['B', 'A', 'D', 'C']);
  assert.equal(library.subjects[0].latest.title, 'B');
  assert.equal(library.subjects[0].updated, '2026-09-02');
  assert.deepEqual(library.recent.map(item => item.title), ['B', 'A', 'D', 'C']);
  assert.equal(compareNotes(note('x.html', { title: 'B', date: '2026-01-01' }), note('y.html', { title: 'A', date: '2026-01-01' })), 1);
});

test('the recent list stays bounded however large the notebook grows', () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    note(`typ/topology/n${String(index).padStart(2, '0')}.html`, { title: `N${index}`, date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}` }));
  const library = buildLibrary(many);
  assert.equal(library.total, 40);
  assert.equal(library.subjects.length, 1);
  assert.equal(library.recent.length, 5);
});

test('a subject.json manifest names, describes and orders its own subject', () => {
  const notes = [note('typ/PDE/heat.html', { date: '2026-09-03' })];
  const plain = buildLibrary(notes);
  assert.equal(plain.subjects[0].label, 'PDE');
  assert.equal(plain.subjects[0].blurb, '');
  const described = buildLibrary(notes, { 'typ/PDE': { label: 'Partial differential equations', blurb: 'Heat, waves and characteristics.', order: -1 } });
  assert.equal(described.subjects[0].label, 'Partial differential equations');
  assert.equal(described.subjects[0].blurb, 'Heat, waves and characteristics.');
  // Invalid manifest fields are ignored rather than published as-is.
  const invalid = buildLibrary(notes, { 'typ/PDE': { label: 42, blurb: '', order: 'first' } });
  assert.equal(invalid.subjects[0].label, 'PDE');
  assert.equal(invalid.subjects[0].blurb, '');
});

test('subject pages get stable, unique URLs even when directory names collide', () => {
  const library = buildLibrary([note('typ/models/a.html'), note('models/b/note.html')]);
  const slugs = library.subjects.map(subject => subject.slug);
  assert.deepEqual(slugs, ['models', 'typ-models']);
  assert.deepEqual(library.subjects.map(subject => subject.href), ['/subjects/models.html', '/subjects/typ-models.html']);
  assert.equal(subjectHref(library.subjects[0]), '/subjects/models.html');
  assert.equal(buildLibrary([note('typ/models/a.html'), note('models/b/note.html')]).subjects.map(s => s.slug).join(), slugs.join());
});

test('the sidebar follows the same subjects as the pages', () => {
  const library = buildLibrary([
    note('typ/topology/continuous.html', { title: 'Continuity', date: '2026-08-11' }),
    note('models/cafeteria/note.html', { title: 'Cafeteria', date: '2026-09-01' }),
  ]);
  const items = sidebar(library);
  assert.deepEqual(items[0].items.map(item => item.link), ['/', ALL_NOTES_PATH, '/about.html']);
  assert.deepEqual(items.slice(1).map(group => group.label), ['Topology', 'Mathematical modeling']);
  assert.deepEqual(items[1].items, [{ label: 'Continuity', link: '/typ/topology/continuous.html' }]);
  const crowded = sidebar(buildLibrary(Array.from({ length: 9 }, (_, index) =>
    note(`typ/topology/n${index}.html`, { title: `N${index}`, date: '2026-01-01' }))));
  assert.equal(crowded[1].collapsed, true, 'a long subject starts collapsed');
});

test('dates are formatted for readers without inventing a value', () => {
  assert.equal(formatDate('2026-08-11'), '11 Aug 2026');
  assert.equal(formatDate('2026-09-01'), '1 Sep 2026');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('someday'), 'someday');
  assert.equal(formatDate('2026-13-01'), '2026-13-01');
});
