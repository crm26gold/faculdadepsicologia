import { z } from 'zod';
import { defaultAreas } from './life';

export const colors = ['sage', 'lavender', 'sand', 'blue', 'rose'] as const;
const identifier = z.string().min(1).max(100);
export const taskKinds = ['Compromisso', 'Tarefa', 'Reunião', 'Consulta', 'Treino', 'Lazer', 'Prática', 'Pagamento', 'Estudo', 'Prova', 'Trabalho', 'Aula'] as const;
const areaSchema = z.object({ id: identifier, name: z.string().trim().min(1).max(100), color: z.enum(colors), hidden: z.boolean().default(false) });
// A notebook may live inside a subject ("Psicologia Social › Caderno outubro"); without one it is a personal notebook.
const notebookSchema = z.object({ id: identifier, name: z.string().trim().min(1).max(100), areaId: z.string().max(100), color: z.enum(colors), subjectId: z.string().max(100).optional() });
export const daySchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Data inválida');
const day = daySchema;
export const CURRENT_EDITOR_GENERATION = 9;
const focusContextSchema = z.object({
  taskId: identifier.optional(), projectId: identifier.optional(),
  taskTitle: z.string().max(160).optional(), projectTitle: z.string().max(160).optional(),
});
const planningStatus = z.enum(['active', 'paused', 'completed', 'archived']);
export const goalSchema = z.object({
  id: identifier, title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(), areaId: z.string().max(100).optional(),
  deadline: day.optional(), status: planningStatus,
  metric: z.object({ unit: z.string().trim().min(1).max(40), baseline: z.number().finite(), target: z.number().finite(), current: z.number().finite() })
    .refine(metric => metric.baseline !== metric.target, 'O alvo deve ser diferente do ponto inicial.').optional(),
});
export const projectSchema = z.object({
  id: identifier, title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(), areaId: z.string().max(100).optional(),
  goalId: identifier.optional(), deadline: day.optional(), status: planningStatus,
});
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido');
export const transactionSchema = z.object({
  id: identifier, description: z.string().trim().min(1).max(160),
  amountCents: z.number().int().positive().max(100_000_000_000),
  type: z.enum(['income', 'expense']), category: z.string().trim().min(1).max(100),
  date: day, areaId: z.string().max(100).optional(),
  // Generation 8: bills and expected income. Without status the entry already happened.
  status: z.enum(['paid', 'pending']).optional(), paidOn: day.optional(),
  nature: z.enum(['fixed', 'variable', 'oneoff']).optional(),
  groupId: identifier.optional(),
  installment: z.object({ index: z.number().int().min(1).max(480), count: z.number().int().min(2).max(480) }).refine(part => part.index <= part.count, 'Parcela inválida').optional(),
});
export const habitSchema = z.object({
  id: identifier, period: z.enum(['morning', 'afternoon', 'night']), time: timeSchema,
  title: z.string().trim().min(1).max(160), areaId: z.string().max(100),
  completedDates: z.array(day).max(3660).refine(values => new Set(values).size === values.length),
});
export const profileSchema = z.object({
  name: z.string().max(100), course: z.string().max(100), semester: z.string().max(60),
  institution: z.string().max(160), campus: z.string().max(100), registration: z.string().max(100),
  email: z.union([z.literal(''), z.email().max(254)]), phone: z.string().max(40),
  photoUrl: z.string().max(400_000).refine(value => !value || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), 'Foto inválida'),
});
export const courseKinds = ['graduacao', 'pos', 'tecnico', 'livre', 'extensao', 'idioma', 'outro'] as const;
export const courseStatuses = ['active', 'paused', 'completed'] as const;
export const courseSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(100), kind: z.enum(courseKinds),
  institution: z.string().trim().max(160).optional(), stage: z.string().trim().max(60).optional(),
  color: z.enum(colors), status: z.enum(courseStatuses),
  units: z.object({ singular: z.string().trim().min(1).max(30), plural: z.string().trim().min(1).max(30) }).optional(),
});
export const subjectSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(100),
  semester: z.number().int().min(1).max(20).optional(), color: z.enum(colors),
  professor: z.string().trim().max(100).optional(),
  courseId: identifier.optional(),
});
export const taskSchema = z.object({
  id: identifier, title: z.string().trim().min(1).max(160), subjectId: z.string().max(100),
  date: day, kind: z.enum(taskKinds), areaId: z.string().max(100).optional(),
  done: z.boolean(), minutes: z.number().int().min(5).max(240),
  time: timeSchema.optional(),
  projectId: identifier.optional(),
  // The group work this deadline came from, so "Na minha agenda" finds it instead of adding another.
  assignmentId: identifier.optional(),
});
export const noteSchema = z.object({
  id: identifier, title: z.string().max(160), subjectId: z.string().max(100),
  content: z.string().max(200_000), updatedAt: z.string().datetime({ offset: true }),
  areaId: z.string().max(100).optional(), notebookId: z.string().max(100).optional(),
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
export const flashcardSchema = z.object({
  id: identifier,
  subjectId: z.string().max(100),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
  lastReviewed: day.optional(),
  intervalDays: z.number().int().min(0).max(365).default(1),
  repetitionCount: z.number().int().min(0).default(0),
});
export type Flashcard = z.infer<typeof flashcardSchema>;

export const termSchema = z.object({ start: day.optional(), end: day.optional() }).refine((item) => !item.start || !item.end || item.end >= item.start, 'O fim do semestre deve ser depois do início.');
export const workspaceSchema = z.object({
  version: z.literal(1), subjects: z.array(subjectSchema).max(100),
  editorGeneration: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9)]).optional(),
  courses: z.array(courseSchema).max(30).optional(),
  goals: z.array(goalSchema).max(200).optional(),
  projects: z.array(projectSchema).max(500).optional(),
  activeFocus: z.object({
    context: focusContextSchema.optional(),
    id: identifier, activity: z.string().trim().min(1).max(160), subjectId: z.string().max(100), areaId: z.string().max(100),
    targetSeconds: z.number().int().min(0).max(14400),
    segments: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative().nullable() })).min(1).max(1000),
  }).superRefine((focus, ctx) => {
    focus.segments.forEach((part, index) => {
      const previous = focus.segments[index - 1];
      if ((part.end !== null && part.end < part.start) || (part.end === null && index !== focus.segments.length - 1) || (previous && (previous.end === null || part.start < previous.end))) ctx.addIssue({ code: 'custom', message: 'Intervalos de foco inválidos' });
    });
  }).nullable().optional(),
  transactions: z.array(transactionSchema).max(5000).optional(),
  // Generation 9: where the money starts. Can be zero or negative (someone who starts in debt).
  finance: z.object({ openingCents: z.number().int().min(-100_000_000_000).max(100_000_000_000), openingDate: day }).optional(),
  habits: z.array(habitSchema).max(300).optional(),
  profile: profileSchema.optional(),
  legacyImportId: z.string().max(100).optional(),
  tasks: z.array(taskSchema).max(2000), notes: z.array(noteSchema).max(300),
  sessions: z.array(z.object({ id: identifier, date: day, minutes: z.number().min(0).max(1500), subjectId: z.string().max(100).optional(), seconds: z.number().min(0).max(90000).optional(), activity: z.string().max(160).optional(), areaId: z.string().max(100).optional(), focusId: identifier.optional(), context: focusContextSchema.optional(),
    startedAt: z.string().datetime({ offset: true }).optional(), endedAt: z.string().datetime({ offset: true }).optional() })).max(5000),
  classes: z.array(classSchema).max(300).default([]),
  term: termSchema.default({}),
  curriculumVersion: z.literal('photo-2026-09').optional(),
  areas: z.array(areaSchema).max(100).optional(),
  notebooks: z.array(notebookSchema).max(300).optional(),
  flashcards: z.array(flashcardSchema).max(1000).optional(),
}).superRefine((data, ctx) => {
  const areas = new Set((data.areas ?? defaultAreas).map((area) => area.id));
  const notebooks = new Set((data.notebooks ?? []).map((book) => book.id));
  for (const collection of ['areas', 'notebooks', 'transactions', 'habits', 'flashcards', 'goals', 'projects', 'courses'] as const) {
    const items = data[collection] ?? [];
    if (new Set(items.map((item) => item.id)).size !== items.length) ctx.addIssue({ code: 'custom', path: [collection], message: 'Identificadores duplicados' });
  }
  for (const collection of ['notes', 'tasks', 'notebooks', 'transactions', 'habits', 'goals', 'projects'] as const) {
    (data[collection] ?? []).forEach((item, index) => {
      if (item.areaId && !areas.has(item.areaId)) ctx.addIssue({ code: 'custom', path: [collection, index, 'areaId'], message: 'Área inexistente' });
    });
  }
  data.notes.forEach((note, index) => {
    if (note.notebookId && !notebooks.has(note.notebookId)) ctx.addIssue({ code: 'custom', path: ['notes', index, 'notebookId'], message: 'Caderno inexistente' });
  });
  const goals = new Set((data.goals ?? []).map(goal => goal.id));
  const projects = new Set((data.projects ?? []).map(project => project.id));
  if ((data.goals !== undefined || data.projects !== undefined || data.tasks.some(task => task.projectId)) && (data.editorGeneration ?? 0) < 5) {
    ctx.addIssue({ code: 'custom', path: ['editorGeneration'], message: 'Planejamento exige editor atualizado.' });
  }
  if ((data.activeFocus?.context || data.sessions.some(session => session.context)) && (data.editorGeneration ?? 0) < 6) {
    ctx.addIssue({ code: 'custom', path: ['editorGeneration'], message: 'Vínculos de foco exigem editor atualizado.' });
  }
  if ((data.courses !== undefined || data.subjects.some(subject => subject.courseId)) && (data.editorGeneration ?? 0) < 7) {
    ctx.addIssue({ code: 'custom', path: ['editorGeneration'], message: 'Cursos exigem editor atualizado.' });
  }
  if ((data.transactions ?? []).some(item => item.status || item.paidOn || item.nature || item.groupId || item.installment) && (data.editorGeneration ?? 0) < 8) {
    ctx.addIssue({ code: 'custom', path: ['editorGeneration'], message: 'Contas e parcelas exigem editor atualizado.' });
  }
  if (data.finance && (data.editorGeneration ?? 0) < 9) {
    ctx.addIssue({ code: 'custom', path: ['editorGeneration'], message: 'Saldo inicial exige editor atualizado.' });
  }
  const courses = new Set((data.courses ?? []).map(course => course.id));
  data.subjects.forEach((subject, index) => {
    if (subject.courseId && !courses.has(subject.courseId)) ctx.addIssue({ code: 'custom', path: ['subjects', index, 'courseId'], message: 'Curso inexistente' });
    if (!subject.courseId && data.courses !== undefined) ctx.addIssue({ code: 'custom', path: ['subjects', index, 'courseId'], message: 'Informe o curso.' });
  });
  data.projects?.forEach((project, index) => {
    if (project.goalId && !goals.has(project.goalId)) ctx.addIssue({ code: 'custom', path: ['projects', index, 'goalId'], message: 'Meta inexistente' });
  });
  data.tasks.forEach((task, index) => {
    if (task.projectId && !projects.has(task.projectId)) ctx.addIssue({ code: 'custom', path: ['tasks', index, 'projectId'], message: 'Projeto inexistente' });
  });
  for (const collection of ['subjects', 'tasks', 'notes', 'sessions', 'classes'] as const) {
    const ids = data[collection].map((item) => item.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [collection], message: 'Identificadores duplicados' });
  }
  const subjects = new Set(data.subjects.map((subject) => subject.id));
  for (const collection of ['notes', 'tasks', 'classes', 'sessions', 'flashcards'] as const) {
    (data[collection] ?? []).forEach((item, index) => {
      if (item.subjectId && !subjects.has(item.subjectId)) ctx.addIssue({ code: 'custom', path: [collection, index], message: 'Matéria inexistente' });
    });
  }
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ActiveFocus = NonNullable<Workspace['activeFocus']>;
export type Subject = z.infer<typeof subjectSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CourseKind = Course['kind'];
export type CourseUnits = NonNullable<Course['units']>;
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
    editorGeneration: CURRENT_EDITOR_GENERATION,
    courses: [{ id: 'psicologia', name: 'Psicologia', kind: 'graduacao', stage: '1º semestre', color: 'rose', status: 'active' }],
    subjects: [
      { id: 'intro', name: 'Introdução à Psicologia', semester: 1, color: 'sage', courseId: 'psicologia' },
      { id: 'neuro', name: 'Bases Biológicas', semester: 1, color: 'lavender', courseId: 'psicologia' },
      { id: 'desenv', name: 'Psicologia do Desenvolvimento', semester: 1, color: 'sand', courseId: 'psicologia' },
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
