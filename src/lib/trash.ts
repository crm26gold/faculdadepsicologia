import { recordTitle, type Collection, type RecordItem } from './assistant-records';
import type { Workspace } from './workspace';

// The personal trash (public.personal_trash): every item removed from the space is kept there by the
// database for 30 days, up to 2 MB per account. Restoring puts the item back; the database then drops it
// from the trash on the next save.
export type TrashRow = { id: string; collection: Collection; item_id: string; item: RecordItem; deleted_at: string; expires_at?: string };
export const trashSections: Record<Collection, string> = {
  tasks: 'Agenda', notes: 'Caderno', transactions: 'Finanças', habits: 'Rotina', goals: 'Metas', projects: 'Projetos', courses: 'Cursos',
  subjects: 'Matérias', classes: 'Aulas', notebooks: 'Cadernos', flashcards: 'Flashcards', areas: 'Áreas', sessions: 'Foco',
};
export const trashTitle = (row: TrashRow) => recordTitle(row.item);

export function restoreFromTrash(data: Workspace, row: TrashRow): Workspace {
  const list = ((data as Record<string, unknown>)[row.collection] ?? []) as RecordItem[];
  if (list.some(item => item.id === row.item_id)) throw new Error(`“${trashTitle(row)}” já está de volta.`);
  return { ...data, [row.collection]: [row.item, ...list] } as Workspace;
}
