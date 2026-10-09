// What the Jornada reads as course material, shared by the page (to check before sending) and the server.
export const materialTypes = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
} as const;
export type MaterialMime = keyof typeof materialTypes;
export const MATERIAL_FILE_LIMIT = 25 * 1024 * 1024;
export const MATERIAL_ACCOUNT_LIMIT = 200 * 1024 * 1024;

/** The type a file name and browser type stand for, or null when the Jornada does not read it yet. */
export function materialMime(name: string, type: string): MaterialMime | null {
  if (type in materialTypes) return type as MaterialMime;
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (Object.entries(materialTypes).find(([, value]) => value === extension)?.[0] as MaterialMime | undefined) ?? null;
}
