import { z } from 'zod';
import { captureNote } from './capture';
import { lifeAreas } from './life';
import { placeFields } from './notebooks';
import { CURRENT_EDITOR_GENERATION, workspaceSchema, type Workspace } from './workspace';

export const entities = ['compromisso', 'anotacao', 'financeiro', 'habito', 'meta', 'projeto', 'curso', 'materia', 'aula', 'caderno', 'flashcard', 'area'] as const;
export type Entity = typeof entities[number];
export const collections = ['tasks', 'notes', 'transactions', 'habits', 'goals', 'projects', 'courses', 'subjects', 'classes', 'notebooks', 'flashcards', 'areas', 'sessions'] as const;
export type Collection = typeof collections[number];
export type RecordItem = { id: string; [key: string]: unknown };
export const entityCollection: Record<Entity, Collection> = {
  compromisso: 'tasks', anotacao: 'notes', financeiro: 'transactions', habito: 'habits', meta: 'goals', projeto: 'projects',
  curso: 'courses', materia: 'subjects', aula: 'classes', caderno: 'notebooks', flashcard: 'flashcards', area: 'areas',
};
export const entityView = {
  compromisso: 'agenda', anotacao: 'notes', financeiro: 'finances', habito: 'routine', meta: 'planning', projeto: 'planning',
  curso: 'studies', materia: 'studies', aula: 'agenda', caderno: 'notes', flashcard: 'flashcards', area: 'settings',
} as const;

export const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export const recordTitle = (item: RecordItem) => String(item.title ?? item.name ?? item.description ?? item.front ?? item.id);
export function records(data: Workspace, entity: Entity): RecordItem[] {
  if (entity === 'aula') return data.classes.map(item => ({ ...item, title: `${data.subjects.find(subject => subject.id === item.subjectId)?.name ?? 'Aula'} · dia ${item.weekday} às ${item.startTime}` }));
  return (entity === 'area' ? lifeAreas(data) : data[entityCollection[entity]] ?? []) as RecordItem[];
}
/** An ambiguous spoken name must never silently select somebody else's item. IDs are preferred. */
export function findRecord(data: Workspace, entity: Entity, target: string): RecordItem {
  const items = records(data, entity);
  const byId = items.find(item => item.id === target);
  if (byId) return byId;
  const wanted = normalized(target);
  const exact = items.filter(item => normalized(recordTitle(item)) === wanted);
  const matches = exact.length ? exact : items.filter(item => normalized(recordTitle(item)).includes(wanted));
  if (matches.length > 1) throw new Error(`Encontrei ${matches.length} itens chamados “${target}”. Informe o horário, a data ou o ID para escolher um.`);
  if (!matches.length) throw new Error(`Não encontrei ${entity}: “${target}”.`);
  return matches[0];
}

// These are the only fields a model can change. IDs, HTML, history and credentials are never writable.
export const entityFields: Record<Entity, string> = {
  compromisso: 'title,date,time,kind,minutes,done,area,subject,project',
  anotacao: 'title,text,replace,area,subject,notebook',
  financeiro: 'description,amount,date,flow,category,pending,nature,area',
  habito: 'title,time,period,area',
  meta: 'title,description,deadline,status,area,metric',
  projeto: 'title,description,deadline,status,area,goal',
  curso: 'name,kind,institution,stage,color,status',
  materia: 'name,semester,professor,color,course',
  aula: 'subject,weekday,startTime,endTime,intervalWeeks,firstDate,location,enabled',
  caderno: 'name,area,color', flashcard: 'front,back,subject', area: 'name,color,hidden',
};
export const recordFields = z.record(z.string().max(40), z.unknown()).refine(fields => Object.keys(fields).length > 0 && Object.keys(fields).length <= 14, 'Informe os campos que deseja alterar.');

function link(data: Workspace, entity: Entity, value: unknown): string {
  if (typeof value !== 'string' || value.length > 160) throw new Error(`Informe um nome ou ID válido de ${entity}.`);
  return value === '' ? '' : findRecord(data, entity, value).id;
}

export function changeRecord(data: Workspace, entity: Entity, fields: Record<string, unknown>, now: number, old?: RecordItem, id = crypto.randomUUID()) {
  for (const key of Object.keys(fields)) if (!entityFields[entity].split(',').includes(key)) throw new Error(`O campo “${key}” não pode ser alterado em ${entity}.`);
  if (fields.replace !== undefined && typeof fields.replace !== 'boolean') throw new Error('O campo replace deve ser true ou false.');
  const places = ['area', 'subject', 'notebook'].filter(key => fields[key] !== undefined && fields[key] !== '');
  if (entity === 'anotacao' && places.length > 1) throw new Error('Uma anotação fica em um lugar só: uma matéria, um caderno ou uma área. Cada matéria já é um caderno. Diga qual dos dois a pessoa prefere.');
  const defaults: Record<Entity, Record<string, unknown>> = {
    compromisso: { subjectId: '', done: false, minutes: 30, kind: 'Compromisso' },
    anotacao: { title: 'Anotação', content: '', subjectId: '', updatedAt: new Date(now).toISOString() },
    financeiro: { type: 'expense', category: 'Outros', nature: 'oneoff', status: 'pending' },
    habito: { period: 'morning', areaId: '', completedDates: [] },
    meta: { status: 'active' }, projeto: { status: 'active' },
    curso: { kind: 'livre', color: 'sage', status: 'active' }, materia: { color: 'sage' },
    aula: { intervalWeeks: 1, location: '', enabled: true }, caderno: { color: 'sage', areaId: '' },
    flashcard: { subjectId: '', intervalDays: 1, repetitionCount: 0 }, area: { color: 'sage', hidden: false },
  };
  const item: RecordItem = old ? { ...old } : { id, ...defaults[entity] };
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'replace') continue;
    if (['area', 'subject', 'project', 'goal', 'course', 'notebook'].includes(key)) {
      const target: Record<string, Entity> = { area: 'area', subject: 'materia', project: 'projeto', goal: 'meta', course: 'curso', notebook: 'caderno' };
      const targetId = link(data, target[key], value);
      if (entity === 'anotacao') {
        Object.assign(item, placeFields(data, targetId ? { kind: key as 'area' | 'subject' | 'notebook', id: targetId } : { kind: 'inbox' }));
        continue;
      }
      if (targetId) item[`${key}Id`] = targetId; else delete item[`${key}Id`];
      if (key === 'subject' && !targetId) item.subjectId = '';
      if (key === 'area' && !targetId && ['habito', 'caderno'].includes(entity)) item.areaId = '';
    } else if (entity === 'anotacao' && key === 'text') {
      if (typeof value !== 'string') throw new Error('Informe o texto da anotação.');
      const note = captureNote(value, item.id, new Date(now).toISOString());
      item.content = old && fields.replace !== true ? String(old.content) + note.content : note.content;
      if (!old && !fields.title) item.title = note.title;
      item.updatedAt = note.updatedAt;
    } else if (entity === 'financeiro' && key === 'amount') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Informe o valor em reais.');
      item.amountCents = Math.round(value * 100);
    } else if (entity === 'financeiro' && key === 'flow') item.type = value;
    else if (entity === 'financeiro' && key === 'pending') {
      if (typeof value !== 'boolean') throw new Error('Informe se a conta está em aberto.');
      item.status = value ? 'pending' : 'paid';
      if (value) delete item.paidOn;
    } else if (['deadline', 'time', 'endTime', 'firstDate'].includes(key) && value === '') delete item[key];
    else item[key] = value;
  }
  if (entity === 'anotacao') item.updatedAt = new Date(now).toISOString();
  if (entity === 'financeiro' && item.status === 'paid') item.paidOn = item.date;
  if (entity === 'materia' && !item.courseId) {
    const courses = data.courses ?? [];
    if (courses.length === 1) item.courseId = courses[0].id;
    else if (data.courses !== undefined) throw new Error('Informe o curso da matéria.');
  }
  const collection = entityCollection[entity];
  const previous = records(data, entity);
  const next = { ...data, [collection]: old ? previous.map(row => row.id === old.id ? item : row) : [...previous, item], editorGeneration: CURRENT_EDITOR_GENERATION };
  return validateChange(next);
}

export function validateChange(next: unknown): Workspace {
  const parsed = workspaceSchema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Confira ${issue.path.join('.')}: ${issue.message}`);
  }
  return parsed.data;
}

/** Keep related records intact. Linked containers must first be emptied or their items moved. */
export function removeRecord(data: Workspace, entity: Entity, item: RecordItem) {
  const id = item.id;
  const used = entity === 'curso' ? data.subjects.some(row => row.courseId === id)
    : entity === 'materia' ? [...data.tasks, ...data.notes, ...data.classes, ...data.sessions, ...(data.flashcards ?? [])].some(row => row.subjectId === id) || data.activeFocus?.subjectId === id
    : entity === 'area' ? [data.tasks, data.notes, data.notebooks, data.transactions, data.habits, data.goals, data.projects, data.sessions].some(rows => rows?.some(row => row.areaId === id)) || data.activeFocus?.areaId === id
    : entity === 'caderno' ? data.notes.some(row => row.notebookId === id)
    : false;
  if (used) throw new Error(`“${recordTitle(item)}” tem registros vinculados. Transfira esses registros antes de excluir ${entity}.`);
  let next = { ...data, [entityCollection[entity]]: records(data, entity).filter(row => row.id !== id) } as Workspace;
  if (entity === 'meta') next = { ...next, projects: next.projects?.map(row => { if (row.goalId !== id) return row; const { goalId: _, ...keep } = row; return keep; }) };
  if (entity === 'projeto') next = { ...next, tasks: next.tasks.map(row => { if (row.projectId !== id) return row; const { projectId: _, ...keep } = row; return keep; }) };
  return validateChange({ ...next, editorGeneration: CURRENT_EDITOR_GENERATION });
}
