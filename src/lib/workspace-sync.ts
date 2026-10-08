import { z } from 'zod';
import { recordVersion } from './assistant-records';
import { workspaceSchema, type Workspace } from './workspace';

// Saving only what changed. For each list, the app sends the records it added or edited and the ones it removed,
// each with the fingerprint of the record as it last saw it, and the order only when it changed beyond adding at
// the end. The single fields (semester, profile, focus...) travel one by one. The server merges that onto its
// current version: changes to different records never collide. When two writers touched the same record, the
// newer one stays; an edit never disappears because somebody else removed the record. Runs in the browser and on
// the server.
export const listKinds = ['subjects', 'courses', 'goals', 'projects', 'transactions', 'habits', 'tasks', 'notes', 'sessions', 'classes', 'areas', 'notebooks', 'flashcards'] as const;
export type ListKind = typeof listKinds[number];
type Item = { id: string; [key: string]: unknown };

const item = z.looseObject({ id: z.string().min(1).max(100) });
const fingerprint = z.string().min(1).max(32);
const listChanges = z.object({
  put: z.array(z.object({ data: item, base: fingerprint.nullable() })).max(5000).optional(),
  remove: z.array(z.object({ id: z.string().min(1).max(100), base: fingerprint })).max(5000).optional(),
  order: z.array(z.string().min(1).max(100)).max(5000).optional(),
  // An optional list that started or stopped existing: no list of areas means the default ones.
  present: z.boolean().optional(),
});
export const workspaceChangesSchema = z.object({
  lists: z.partialRecord(z.enum(listKinds), listChanges).optional(),
  settings: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,59}$/), z.object({ value: z.unknown().optional(), removed: z.literal(true).optional(), base: fingerprint.nullable() })).optional(),
});
export type WorkspaceChanges = z.infer<typeof workspaceChangesSchema>;
export type Conflict = { list: ListKind | 'settings'; id: string };

const isList = (key: string) => (listKinds as readonly string[]).includes(key);
const listOf = (doc: Workspace, kind: ListKind) => (doc[kind] ?? []) as Item[];
// Both sides come out of the same schema, so the key order matches.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const singleFields = (doc: Workspace) => Object.fromEntries(Object.entries(doc).filter(([key, value]) => !isList(key) && value !== undefined));
const versionOf = (value: unknown) => value === undefined ? null : recordVersion(value);

/** What changed from `base` (the version the server has) to `next`; null when nothing did. */
export function workspaceChanges(base: Workspace, next: Workspace): WorkspaceChanges | null {
  const lists: NonNullable<WorkspaceChanges['lists']> = {};
  for (const kind of listKinds) {
    const before = listOf(base, kind), after = listOf(next, kind);
    const old = new Map(before.map(entry => [entry.id, entry]));
    const kept = new Set(after.map(entry => entry.id));
    const put = after.filter(entry => !old.has(entry.id) || !same(old.get(entry.id), entry))
      .map(entry => ({ data: entry, base: old.has(entry.id) ? recordVersion(old.get(entry.id)) : null }));
    const remove = before.filter(entry => !kept.has(entry.id)).map(entry => ({ id: entry.id, base: recordVersion(entry) }));
    const appended = [...before.filter(entry => kept.has(entry.id)), ...after.filter(entry => !old.has(entry.id))].map(entry => entry.id);
    const order = after.map(entry => entry.id);
    const reordered = !same(order, appended);
    const present = next[kind] !== undefined, toggled = (base[kind] !== undefined) !== present;
    if (put.length || remove.length || reordered || toggled) {
      lists[kind] = { ...(put.length ? { put } : {}), ...(remove.length ? { remove } : {}), ...(reordered ? { order } : {}), ...(toggled ? { present } : {}) };
    }
  }
  const before = singleFields(base), after = singleFields(next);
  const settings: NonNullable<WorkspaceChanges['settings']> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    settings[key] = key in after ? { value: after[key], base: versionOf(before[key]) } : { removed: true, base: versionOf(before[key]) };
  }
  const hasLists = Object.keys(lists).length > 0, hasSettings = Object.keys(settings).length > 0;
  return hasLists || hasSettings ? { ...(hasLists ? { lists } : {}), ...(hasSettings ? { settings } : {}) } : null;
}

// Records another writer added keep their place relative to the start of the list.
function reorder(items: Item[], order: string[]) {
  const wanted = new Map(order.map((id, at) => [id, at]));
  const result = items.filter(entry => wanted.has(entry.id)).sort((a, b) => wanted.get(a.id)! - wanted.get(b.id)!);
  items.forEach((entry, at) => { if (!wanted.has(entry.id)) result.splice(Math.min(at, result.length), 0, entry); });
  return result;
}

/** The changes applied onto `current`, with the records another writer changed in the meantime. Unvalidated. */
export function mergeChanges(current: Workspace, changes: WorkspaceChanges): { merged: Workspace; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];
  const merged: Record<string, unknown> = { ...current };
  for (const kind of listKinds) {
    const change = changes.lists?.[kind];
    if (!change) continue;
    let items = [...listOf(current, kind)];
    for (const removal of change.remove ?? []) {
      const at = items.findIndex(entry => entry.id === removal.id);
      if (at < 0) continue;
      // Edited elsewhere after this screen saw it: the edit stays.
      if (recordVersion(items[at]) !== removal.base) { conflicts.push({ list: kind, id: removal.id }); continue; }
      items.splice(at, 1);
    }
    for (const { data, base } of change.put ?? []) {
      const at = items.findIndex(entry => entry.id === data.id);
      if (at < 0) {
        // Removed elsewhere while edited here: the edit wins over the removal.
        if (base !== null) conflicts.push({ list: kind, id: data.id });
        items.push(data as Item);
        continue;
      }
      // The same edit made in both places is no conflict.
      if (recordVersion(items[at]) !== (base ?? '') && recordVersion(items[at]) !== recordVersion(data)) conflicts.push({ list: kind, id: data.id });
      items[at] = data as Item;
    }
    if (change.order) items = reorder(items, change.order);
    // A list that stops existing only goes away empty: what another writer put in it stays.
    if (change.present === false && items.length === 0) delete merged[kind];
    else if (items.length || change.present || current[kind] !== undefined) merged[kind] = items;
  }
  for (const [key, change] of Object.entries(changes.settings ?? {})) {
    if (isList(key)) continue;
    const value = change.removed ? undefined : change.value;
    if (versionOf(merged[key]) !== change.base && versionOf(merged[key]) !== versionOf(value)) conflicts.push({ list: 'settings', id: key });
    if (change.removed) delete merged[key]; else merged[key] = change.value;
  }
  return { merged: merged as Workspace, conflicts };
}

export type Applied = { workspace: Workspace; conflicts: Conflict[] } | { refused: 'outdated' | 'invalid' | 'clash' | 'full' };

/**
 * On the server: the changes on top of the stored version, validated whole. `moved` says someone else saved after
 * the version this screen had, so a rule across records broken only by the merge (a task in a subject removed
 * elsewhere) is a clash between two writers, not bad input.
 */
export function applyChanges(stored: Workspace, changes: WorkspaceChanges, editorGeneration: number, moved: boolean): Applied {
  // An app older than the one that last saved could drop fields it does not know yet.
  if (editorGeneration < (stored.editorGeneration ?? 0)) return { refused: 'outdated' };
  const { merged, conflicts } = mergeChanges(stored, changes);
  const result = workspaceSchema.safeParse(merged);
  if (!result.success) return { refused: moved ? 'clash' : 'invalid' };
  if (JSON.stringify(result.data).length > 2_000_000) return { refused: 'full' };
  return { workspace: result.data, conflicts };
}
