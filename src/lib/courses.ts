import { CURRENT_EDITOR_GENERATION, type Course, type CourseKind, type CourseUnits, type Subject, type Workspace } from './workspace';

export const DEFAULT_COURSE_ID = 'curso-principal';
export const courseKindLabels: Record<CourseKind, string> = { graduacao: 'Graduação', pos: 'Pós-graduação', tecnico: 'Técnico', livre: 'Curso livre', extensao: 'Extensão', idioma: 'Idiomas', outro: 'Outro' };
export const courseStatusLabels: Record<Course['status'], string> = { active: 'Em andamento', paused: 'Pausado', completed: 'Concluído' };
export const unitPresets: readonly CourseUnits[] = [
  { singular: 'matéria', plural: 'matérias' }, { singular: 'módulo', plural: 'módulos' }, { singular: 'disciplina', plural: 'disciplinas' },
  { singular: 'aula', plural: 'aulas' }, { singular: 'unidade', plural: 'unidades' },
];
export function defaultUnits(kind: CourseKind): CourseUnits {
  return { ...unitPresets[kind === 'livre' || kind === 'extensao' || kind === 'idioma' ? 1 : 0] };
}
export const courseUnits = (course: Pick<Course, 'kind' | 'units'>): CourseUnits => course.units ?? defaultUnits(course.kind);
export const unitCount = (course: Pick<Course, 'kind' | 'units'>, count: number) => `${count} ${count === 1 ? courseUnits(course).singular : courseUnits(course).plural}`;
export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

// Legacy subjects join one course derived from the profile. Pure; unchanged data keeps its reference.
export function ensureCourses(data: Workspace): Workspace {
  const known = new Set((data.courses ?? []).map(course => course.id));
  const attached = (subject: Subject) => !!subject.courseId && known.has(subject.courseId);
  if (data.courses === undefined ? !data.subjects.length : data.subjects.every(attached)) return data;
  const profile = data.profile;
  const fallback: Course = { id: DEFAULT_COURSE_ID, name: profile?.course.trim() || 'Meu curso', kind: 'graduacao',
    ...(profile?.institution.trim() ? { institution: profile.institution.trim() } : {}), ...(profile?.semester.trim() ? { stage: profile.semester.trim() } : {}),
    color: data.subjects[0]?.color ?? 'sage', status: 'active' };
  return { ...data, editorGeneration: CURRENT_EDITOR_GENERATION,
    courses: known.has(DEFAULT_COURSE_ID) ? data.courses : [...(data.courses ?? []), fallback],
    subjects: data.subjects.map(subject => attached(subject) ? subject : { ...subject, courseId: DEFAULT_COURSE_ID }) };
}
export const subjectsOfCourse = (data: Workspace, courseId: string) => data.subjects.filter(subject => subject.courseId === courseId);
export const courseOf = (data: Workspace, subject: Pick<Subject, 'courseId'>) => data.courses?.find(course => course.id === subject.courseId);
export const activeCourses = (data: Workspace) => (data.courses ?? []).filter(course => course.status === 'active');
