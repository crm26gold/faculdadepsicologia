import type { Note, Workspace } from './workspace';
import { activeCourses, subjectsOfCourse } from './courses';
import { lifeAreas } from './life';

// Where a note lives, as one value: every subject/module is already a notebook, personal notebooks are the
// person's own, and an area alone is for loose personal notes. Nothing set = "Para organizar".
export type Place = { kind: 'inbox' } | { kind: 'subject'; id: string } | { kind: 'notebook'; id: string } | { kind: 'area'; id: string };
export const placeKey = (place: Place) => place.kind === 'inbox' ? 'inbox' : `${place.kind}:${place.id}`;
export function parsePlace(key: string): Place {
  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  return (kind === 'subject' || kind === 'notebook' || kind === 'area') && id ? { kind, id } : { kind: 'inbox' };
}
export function placeOf(note: Pick<Note, 'subjectId' | 'notebookId' | 'areaId'>): Place {
  if (note.subjectId) return { kind: 'subject', id: note.subjectId };
  if (note.notebookId) return { kind: 'notebook', id: note.notebookId };
  if (note.areaId) return { kind: 'area', id: note.areaId };
  return { kind: 'inbox' };
}
/** The fields a note gets when it moves somewhere; the old location is fully cleared. */
export function placeFields(data: Workspace, place: Place): Pick<Note, 'subjectId' | 'notebookId' | 'areaId'> {
  if (place.kind === 'subject') return { subjectId: place.id, notebookId: '', areaId: 'studies' };
  if (place.kind === 'notebook') { const book = data.notebooks?.find(item => item.id === place.id); return { subjectId: '', notebookId: place.id, areaId: subjectOf(data, book) ? 'studies' : book?.areaId ?? '' }; }
  if (place.kind === 'area') return { subjectId: '', notebookId: '', areaId: place.id };
  return { subjectId: '', notebookId: '', areaId: '' };
}
export const samePlace = (a: Place, b: Place) => placeKey(a) === placeKey(b);
export const notesIn = (data: Workspace, place: Place) => data.notes.filter(note => samePlace(placeOf(note), place)).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export function placeName(data: Workspace, place: Place) {
  if (place.kind === 'inbox') return 'Para organizar';
  if (place.kind === 'subject') return data.subjects.find(item => item.id === place.id)?.name ?? 'Matéria removida';
  if (place.kind === 'notebook') return data.notebooks?.find(item => item.id === place.id)?.name ?? 'Caderno removido';
  return lifeAreas(data).find(item => item.id === place.id)?.name ?? 'Área removida';
}
/** Breadcrumb trail, e.g. ["Estudos", "Psicologia", "Ética"] or ["Meus cadernos", "Diário"]. */
export function placeTrail(data: Workspace, place: Place): string[] {
  if (place.kind === 'subject') {
    const subject = data.subjects.find(item => item.id === place.id);
    const course = data.courses?.find(item => item.id === subject?.courseId);
    return ['Estudos', ...(course ? [course.name] : []), placeName(data, place)];
  }
  if (place.kind === 'notebook') {
    const subject = subjectOf(data, data.notebooks?.find(item => item.id === place.id));
    return subject ? [...placeTrail(data, { kind: 'subject', id: subject.id }), placeName(data, place)] : ['Meus cadernos', placeName(data, place)];
  }
  if (place.kind === 'area') return ['Áreas da vida', placeName(data, place)];
  return ['Para organizar'];
}

/** The subject a notebook lives in, when it still exists. */
export const subjectOf = (data: Workspace, book?: { subjectId?: string }) => book?.subjectId ? data.subjects.find(subject => subject.id === book.subjectId) : undefined;
/** Notebooks inside a subject, and the personal ones (no subject, or a subject that was removed). */
export const notebooksOf = (data: Workspace, subjectId: string) => (data.notebooks ?? []).filter(book => book.subjectId === subjectId && subjectOf(data, book));
export const personalNotebooks = (data: Workspace) => (data.notebooks ?? []).filter(book => !subjectOf(data, book));

export type PlaceGroup = { label: string; options: { key: string; label: string; count: number }[] };
/** Everything a note can belong to, grouped the way the library shows it. Paused/finished courses stay reachable. */
export function placeGroups(data: Workspace): PlaceGroup[] {
  const count = (place: Place) => data.notes.filter(note => samePlace(placeOf(note), place)).length;
  const option = (place: Place) => ({ key: placeKey(place), label: placeName(data, place), count: count(place) });
  const active = new Set(activeCourses(data).map(course => course.id));
  const courses = (data.courses ?? []).toSorted((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)));
  // Each subject, followed by its own notebooks as "Matéria › Caderno".
  const withBooks = (subject: { id: string; name: string }) => [option({ kind: 'subject', id: subject.id }),
    ...notebooksOf(data, subject.id).map(book => ({ ...option({ kind: 'notebook', id: book.id }), label: `${subject.name} › ${book.name}` }))];
  const orphan = data.subjects.filter(subject => !subject.courseId || !data.courses?.some(course => course.id === subject.courseId));
  return [
    { label: 'Para organizar', options: [option({ kind: 'inbox' })] },
    ...courses.map(course => ({ label: `Estudos · ${course.name}`, options: subjectsOfCourse(data, course.id).flatMap(withBooks) })),
    ...(orphan.length ? [{ label: 'Estudos', options: orphan.flatMap(withBooks) }] : []),
    { label: 'Meus cadernos', options: personalNotebooks(data).map(book => option({ kind: 'notebook', id: book.id })) },
    { label: 'Áreas da vida, sem caderno', options: lifeAreas(data).filter(area => !area.hidden || count({ kind: 'area', id: area.id })).map(area => option({ kind: 'area', id: area.id })) },
  ].filter(group => group.options.length);
}

export const noteExcerpt = (note: Pick<Note, 'content'>, size = 140) =>
  note.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, size);
