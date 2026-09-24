import { z } from 'zod';

export const colors = ['sage', 'lavender', 'sand', 'blue', 'rose'] as const;
const identifier = z.string().min(1).max(100);
export const daySchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Data inválida');
const day = daySchema;
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido');
export const subjectSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(100),
  semester: z.number().int().min(1).max(20), color: z.enum(colors),
  professor: z.string().trim().max(100).optional(),
});
export const taskSchema = z.object({
  id: identifier, title: z.string().trim().min(1).max(160), subjectId: z.string().max(100),
  date: day, kind: z.enum(['Estudo', 'Prova', 'Trabalho', 'Aula']),
  done: z.boolean(), minutes: z.number().int().min(5).max(240),
  time: timeSchema.optional(),
});
export const noteSchema = z.object({
  id: identifier, title: z.string().max(160), subjectId: z.string().max(100),
  content: z.string().max(200_000), updatedAt: z.string().datetime(),
});
export const classSchema = z.object({
  id: identifier, subjectId: identifier, weekday: z.number().int().min(0).max(6),
  startTime: timeSchema, endTime: timeSchema.optional(),
  intervalWeeks: z.number().int().min(1).max(12), firstDate: day.optional(),
  location: z.string().trim().max(160), enabled: z.boolean(),
}).superRefine((item, ctx) => {
  if (item.endTime && item.endTime <= item.startTime) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'O término deve ser depois do início.' });
  if (item.firstDate && new Date(`${item.firstDate}T12:00:00`).getDay() !== item.weekday) ctx.addIssue({ code: 'custom', path: ['firstDate'], message: 'A primeira data deve coincidir com o dia da semana.' });
});
export const termSchema = z.object({ start: day.optional(), end: day.optional() }).refine((item) => !item.start || !item.end || item.end >= item.start, 'O fim do semestre deve ser depois do início.');
export const workspaceSchema = z.object({
  version: z.literal(1), subjects: z.array(subjectSchema).max(100),
  tasks: z.array(taskSchema).max(2000), notes: z.array(noteSchema).max(300),
  sessions: z.array(z.object({ id: identifier, date: day, minutes: z.number().int().min(1).max(240) })).max(5000),
  classes: z.array(classSchema).max(300).default([]),
  term: termSchema.default({}),
  curriculumVersion: z.literal('photo-2026-09').optional(),
}).superRefine((data, ctx) => {
  for (const collection of ['subjects', 'tasks', 'notes', 'sessions', 'classes'] as const) {
    const ids = data[collection].map((item) => item.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [collection], message: 'Identificadores duplicados' });
  }
  const subjects = new Set(data.subjects.map((subject) => subject.id));
  for (const collection of ['notes', 'tasks', 'classes'] as const) {
    data[collection].forEach((item, index) => {
      if (item.subjectId && !subjects.has(item.subjectId)) ctx.addIssue({ code: 'custom', path: [collection, index], message: 'Matéria inexistente' });
    });
  }
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Note = z.infer<typeof noteSchema>;
export type ClassSession = z.infer<typeof classSchema>;
export const emptyWorkspace = (): Workspace => ({ version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} });
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function formatDate(key: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', options);
}
export function priorityTasks(data: Workspace, today: string) {
  return data.tasks.filter((task) => !task.done).toSorted((a, b) => a.date.localeCompare(b.date) || a.minutes - b.minutes).filter((task) => task.date <= today).slice(0, 3);
}
export function demoWorkspace(today: string): Workspace {
  return {
    ...emptyWorkspace(),
    version: 1,
    subjects: [
      { id: 'intro', name: 'Introdução à Psicologia', semester: 1, color: 'sage' },
      { id: 'neuro', name: 'Bases Biológicas', semester: 1, color: 'lavender' },
      { id: 'desenv', name: 'Psicologia do Desenvolvimento', semester: 1, color: 'sand' },
    ],
    tasks: [
      { id: 't1', title: 'Revisar as escolas da Psicologia', subjectId: 'intro', date: today, kind: 'Estudo', minutes: 25, done: false },
      { id: 't2', title: 'Organizar as anotações da aula', subjectId: 'neuro', date: today, kind: 'Estudo', minutes: 15, done: false },
      { id: 't3', title: 'Ler a introdução do capítulo', subjectId: 'desenv', date: today, kind: 'Estudo', minutes: 10, done: true },
      { id: 't4', title: 'Revisão em grupo', subjectId: 'intro', date: addDays(today, 2), kind: 'Aula', minutes: 30, done: false },
      { id: 't5', title: 'Entrega da atividade', subjectId: 'desenv', date: addDays(today, 4), kind: 'Trabalho', minutes: 45, done: false },
    ],
    notes: [{ id: 'n1', title: 'Um novo jeito de aprender', subjectId: 'intro', content: '<h2>Uma ideia de cada vez</h2><p>Este é um caderno de exemplo. Você pode experimentar a edição, criar uma lista e destacar suas ideias.</p><ul><li><p>O que despertou minha curiosidade?</p></li><li><p>O que quero entender melhor?</p></li></ul>', updatedAt: new Date().toISOString() }],
    sessions: [],
    classes: [
      { id: 'example-intro', subjectId: 'intro', weekday: 1, startTime: '18:00', intervalWeeks: 1, location: 'Sala de exemplo', enabled: true },
      { id: 'example-neuro', subjectId: 'neuro', weekday: 3, startTime: '18:00', intervalWeeks: 1, location: 'Sala de exemplo', enabled: true },
      { id: 'example-online', subjectId: 'desenv', weekday: 5, startTime: '17:00', intervalWeeks: 3, location: 'Online · exemplo', enabled: true },
    ],
  };
}
export const LOCAL_KEY = 'faculdade-psi:personal:v1';
export function parseWorkspace(raw: string): Workspace {
  if (raw.length > 2_000_000) throw new Error('Arquivo maior que 2 MB.');
  return workspaceSchema.parse(JSON.parse(raw));
}
