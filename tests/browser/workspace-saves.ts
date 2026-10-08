import { applyChanges, type WorkspaceChanges } from '../../src/lib/workspace-sync';
import { parseWorkspace, type Workspace } from '../../src/lib/workspace';

export type SaveBody = { changes?: WorkspaceChanges; data?: unknown; revision: number; editorGeneration?: number };

/**
 * What /api/workspace does with a save: the screen sends only what changed, and the server merges it onto the
 * version it has, answering with the merged version when someone else wrote in between.
 */
export function answerSave(stored: { data: unknown; revision: number }, body: SaveBody) {
  const revision = stored.revision + 1;
  if (body.data) return { data: parseWorkspace(JSON.stringify(body.data)), revision, answer: { revision } };
  const applied = applyChanges(parseWorkspace(JSON.stringify(stored.data)), body.changes ?? {}, body.editorGeneration ?? 0, body.revision !== stored.revision);
  if ('refused' in applied) throw new Error(`Gravação recusada: ${applied.refused}`);
  const joined = body.revision !== stored.revision || applied.conflicts.length > 0;
  return { data: applied.workspace, revision, answer: { revision, ...(joined ? { data: applied.workspace } : {}), ...(applied.conflicts.length ? { conflicts: applied.conflicts } : {}) } };
}

/** The documents the server would hold after each save, starting from the one the screen loaded. */
export function savedVersions(start: unknown) {
  let stored = { data: start, revision: 1 };
  const versions: Workspace[] = [], bodies: SaveBody[] = [];
  return {
    versions, bodies,
    take(body: SaveBody) {
      // The tests' servers answer without the merged version, so the screen always saves on top of its own.
      const saved = answerSave({ ...stored, revision: body.revision }, body);
      stored = saved; bodies.push(body); versions.push(saved.data);
      return saved.data;
    },
  };
}
