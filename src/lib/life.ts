import type { Workspace } from './workspace';

export const defaultAreas = [
  { id: 'studies', name: 'Estudos e aprendizagem', color: 'blue' },
  { id: 'work', name: 'Trabalho e carreira', color: 'blue' },
  { id: 'finance', name: 'Finanças', color: 'sand' },
  { id: 'health', name: 'Saúde física', color: 'sage' },
  { id: 'emotional', name: 'Emocional e autoconhecimento', color: 'lavender' },
  { id: 'spiritual', name: 'Espiritualidade e propósito', color: 'lavender' },
  { id: 'family', name: 'Família e relacionamentos', color: 'rose' },
  { id: 'social', name: 'Social e networking', color: 'rose' },
  { id: 'home', name: 'Casa, patrimônio e inventário', color: 'sand' },
  { id: 'leisure', name: 'Descanso, lazer e experiências', color: 'sage' },
  { id: 'personal', name: 'Pessoal, documentos e segurança', color: 'blue' },
] as const;

export function lifeAreas(data: Workspace) {
  return data.areas ?? defaultAreas.map((area) => ({ ...area, hidden: false }));
}
export function itemArea(item: { areaId?: string; subjectId: string }) {
  return item.areaId ?? (item.subjectId ? 'studies' : '');
}
export function areaName(data: Workspace, item: { areaId?: string; subjectId: string }) {
  return lifeAreas(data).find((area) => area.id === itemArea(item))?.name ?? 'Sem área';
}
