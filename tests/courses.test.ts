import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_EDITOR_GENERATION, courseKinds, emptyWorkspace, parseWorkspace, workspaceSchema, type Course, type Workspace } from '../src/lib/workspace';
import { activeCourses, courseKindLabels, courseOf, courseUnits, DEFAULT_COURSE_ID, defaultUnits, ensureCourses, subjectsOfCourse, unitCount } from '../src/lib/courses';

const legacy = (): Workspace => ({ ...emptyWorkspace(), editorGeneration: 5,
  subjects: [{ id: 'b', name: 'Bases', semester: 2, color: 'lavender' }, { id: 'a', name: 'Anatomia', semester: 1, color: 'sand', professor: 'Docente' }],
  tasks: [{ id: 't', title: 'Revisar', subjectId: 'a', date: '2026-09-30', kind: 'Estudo', minutes: 25, done: false }],
  notes: [{ id: 'n', title: 'Resumo', subjectId: 'b', content: '<p>Texto</p>', updatedAt: '2026-09-30T12:00:00.000Z' }],
  classes: [{ id: 'c', subjectId: 'a', weekday: 1, startTime: '18:00', intervalWeeks: 1, location: 'Online', enabled: true }],
  sessions: [{ id: 's', date: '2026-09-29', minutes: 25, subjectId: 'b' }],
  flashcards: [{ id: 'f', subjectId: 'a', front: 'Pergunta', back: 'Resposta', intervalDays: 1, repetitionCount: 0 }],
  goals: [{ id: 'g', title: 'Aprovar', status: 'active' }], term: { start: '2026-08-01' },
});
const hypnosis: Course = { id: 'hipnose', name: 'Hipnose clínica', kind: 'livre', color: 'blue', status: 'paused', units: { singular: 'encontro', plural: 'encontros' } };
const modern = (): Workspace => ({ ...ensureCourses(legacy()), courses: [...ensureCourses(legacy()).courses!, hypnosis] });

test('backup antigo da geração 5 continua legível sem ganhar cursos', () => {
  const parsed = parseWorkspace(JSON.stringify(legacy()));
  assert.deepEqual(parsed, legacy());
  assert.equal(Object.hasOwn(parsed, 'courses'), false);
  assert.equal(parsed.subjects.some(subject => Object.hasOwn(subject, 'courseId')), false);
});

test('ensureCourses cria o curso principal preservando ordem, IDs e todas as outras coleções', () => {
  const before = legacy();
  const snapshot = structuredClone(before);
  const result = ensureCourses(before);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(result.subjects.map(subject => subject.id), ['b', 'a']);
  assert.deepEqual(result.subjects, before.subjects.map(subject => ({ ...subject, courseId: DEFAULT_COURSE_ID })));
  assert.deepEqual(result.courses, [{ id: DEFAULT_COURSE_ID, name: 'Meu curso', kind: 'graduacao', color: 'lavender', status: 'active' }]);
  assert.equal(result.editorGeneration, CURRENT_EDITOR_GENERATION);
  const { subjects: _s, courses: _c, editorGeneration: _g, ...rest } = result;
  const { subjects: _bs, editorGeneration: _bg, ...restBefore } = before;
  assert.deepEqual(rest, restBefore);
  assert.deepEqual(parseWorkspace(JSON.stringify(result)), result);
  assert.equal(workspaceSchema.safeParse(result).success, true);
});

test('ensureCourses é idempotente e não altera espaços sem matérias', () => {
  const once = ensureCourses(legacy());
  assert.equal(ensureCourses(once), once);
  assert.deepEqual(ensureCourses(structuredClone(once)), once);
  const empty = emptyWorkspace();
  assert.equal(ensureCourses(empty), empty);
  const noSubjects: Workspace = { ...empty, editorGeneration: CURRENT_EDITOR_GENERATION, courses: [] };
  assert.equal(ensureCourses(noSubjects), noSubjects);
  const demo = modern();
  assert.equal(ensureCourses(demo), demo);
});

test('curso principal usa o perfil quando preenchido', () => {
  const profile = { name: '', course: '  Psicologia ', semester: ' 3º semestre ', institution: ' Universidade Exemplo ', campus: '', registration: '', email: '', phone: '', photoUrl: '' } as const;
  assert.deepEqual(ensureCourses({ ...legacy(), profile }).courses, [{ id: DEFAULT_COURSE_ID, name: 'Psicologia', kind: 'graduacao', institution: 'Universidade Exemplo', stage: '3º semestre', color: 'lavender', status: 'active' }]);
  const blank = { ...profile, course: '   ', semester: '', institution: ' ' };
  assert.deepEqual(ensureCourses({ ...legacy(), profile: blank }).courses, [{ id: DEFAULT_COURSE_ID, name: 'Meu curso', kind: 'graduacao', color: 'lavender', status: 'active' }]);
});

test('matérias órfãs vão para o curso principal sem duplicá-lo', () => {
  const data: Workspace = { ...legacy(), editorGeneration: CURRENT_EDITOR_GENERATION, courses: [hypnosis],
    subjects: [{ id: 'x', name: 'Indução', color: 'blue', courseId: 'hipnose' }, { id: 'y', name: 'Órfã', color: 'rose', courseId: 'apagado' }, ...legacy().subjects] };
  const result = ensureCourses(data);
  assert.deepEqual(result.subjects.map(subject => [subject.id, subject.courseId]), [['x', 'hipnose'], ['y', DEFAULT_COURSE_ID], ['b', DEFAULT_COURSE_ID], ['a', DEFAULT_COURSE_ID]]);
  assert.deepEqual(result.courses?.map(course => course.id), ['hipnose', DEFAULT_COURSE_ID]);
  assert.equal(result.courses?.[1].color, 'blue');
  assert.deepEqual(parseWorkspace(JSON.stringify(result)), result);
  const again = ensureCourses({ ...result, subjects: [...result.subjects, { id: 'z', name: 'Nova', color: 'sage' }] });
  assert.deepEqual(again.courses, result.courses);
  assert.equal(again.subjects.at(-1)?.courseId, DEFAULT_COURSE_ID);
});

test('schema recusa curso inexistente, IDs duplicados, geração antiga e matéria sem curso', () => {
  const data = modern();
  assert.equal(workspaceSchema.safeParse(data).success, true);
  const unknown = workspaceSchema.safeParse({ ...data, subjects: [{ ...data.subjects[0], courseId: 'fantasma' }, data.subjects[1]] });
  assert.equal(unknown.success, false);
  assert.ok(unknown.error?.issues.some(issue => issue.message === 'Curso inexistente'));
  assert.equal(workspaceSchema.safeParse({ ...data, courses: [...data.courses!, data.courses![0]] }).success, false);
  for (const editorGeneration of [undefined, 5, 6, 8]) assert.equal(workspaceSchema.safeParse({ ...data, editorGeneration }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...legacy(), subjects: [{ ...legacy().subjects[0], courseId: 'b' }] }).success, false);
  const { courseId: _courseId, ...loose } = data.subjects[0];
  assert.equal(workspaceSchema.safeParse({ ...data, subjects: [loose, data.subjects[1]] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...legacy(), editorGeneration: CURRENT_EDITOR_GENERATION, courses: [] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION, courses: [hypnosis] }).success, true);
});

test('curso valida nome, tipo, etapa e nomenclatura personalizada', () => {
  const data = modern();
  const withCourse = (patch: object) => workspaceSchema.safeParse({ ...data, courses: [data.courses![0], { ...hypnosis, ...patch }] });
  for (const patch of [{ name: '  ' }, { kind: 'mestrado' }, { stage: 'x'.repeat(61) }, { status: 'archived' }, { units: { singular: ' ', plural: 'aulas' } }, { units: { singular: 'aula', plural: 'x'.repeat(31) } }]) {
    assert.equal(withCourse(patch).success, false);
  }
  const parsed = withCourse({ name: ' Inglês ', stage: ' Módulo 2 ', units: { singular: ' lição ', plural: ' lições ' } });
  assert.deepEqual(parsed.data?.courses?.[1], { ...hypnosis, name: 'Inglês', stage: 'Módulo 2', units: { singular: 'lição', plural: 'lições' } });
});

test('nomenclatura padrão segue o tipo do curso e aceita substituição', () => {
  const expected = { graduacao: 'matérias', pos: 'matérias', tecnico: 'matérias', livre: 'módulos', extensao: 'módulos', idioma: 'módulos', outro: 'matérias' } as const;
  for (const kind of courseKinds) {
    assert.equal(defaultUnits(kind).plural, expected[kind]);
    assert.equal(defaultUnits(kind).singular, expected[kind].slice(0, -1));
    assert.ok(courseKindLabels[kind]);
  }
  assert.deepEqual(Object.keys(courseKindLabels), [...courseKinds]);
  defaultUnits('livre').plural = 'alterado';
  assert.equal(defaultUnits('livre').plural, 'módulos');
  assert.deepEqual(courseUnits(hypnosis), { singular: 'encontro', plural: 'encontros' });
  assert.deepEqual(courseUnits({ kind: 'extensao' }), { singular: 'módulo', plural: 'módulos' });
  assert.equal(unitCount(hypnosis, 1), '1 encontro');
  assert.equal(unitCount({ kind: 'pos' }, 3), '3 matérias');
});

test('consultas agrupam matérias por curso e filtram cursos ativos', () => {
  const data = modern();
  data.subjects.push({ id: 'x', name: 'Indução', color: 'blue', courseId: 'hipnose' });
  assert.deepEqual(subjectsOfCourse(data, DEFAULT_COURSE_ID).map(subject => subject.id), ['b', 'a']);
  assert.deepEqual(subjectsOfCourse(data, 'hipnose').map(subject => subject.id), ['x']);
  assert.equal(courseOf(data, data.subjects[2])?.name, 'Hipnose clínica');
  assert.equal(courseOf(data, { courseId: undefined }), undefined);
  assert.deepEqual(activeCourses(data).map(course => course.id), [DEFAULT_COURSE_ID]);
  assert.deepEqual(activeCourses(emptyWorkspace()), []);
});
