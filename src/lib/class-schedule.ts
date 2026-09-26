import { classSchema, workspaceSchema, type Workspace } from './workspace';

/** Preserve stable IDs on edits and validate subject ownership within this workspace. */
export function upsertClass(data: Workspace, input: unknown): Workspace {
  const session = classSchema.parse(input);
  return workspaceSchema.parse({
    ...data,
    classes: data.classes.some((item) => item.id === session.id)
      ? data.classes.map((item) => item.id === session.id ? session : item)
      : [...data.classes, session],
  });
}
