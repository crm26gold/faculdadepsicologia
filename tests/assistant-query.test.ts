import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryWorkspace } from '../src/lib/assistant-query';
import { emptyWorkspace, type Workspace } from '../src/lib/workspace';

const today = '2026-10-07'; // quarta-feira
const weekday = new Date(`${today}T12:00:00`).getDay();
const data = (): Workspace => ({ ...emptyWorkspace(),
  courses: [{ id: 'psi', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }, { id: 'ia', name: 'Inteligência Artificial', kind: 'livre', color: 'blue', status: 'active' }],
  subjects: [
    { id: 'tec', name: 'Técnicas de Entrevista e Observação', color: 'rose', courseId: 'psi', professor: 'Leonardo' },
    { id: 'ml', name: 'Aprendizado de Máquina', color: 'blue', courseId: 'ia' },
  ],
  classes: [
    { id: 'c1', subjectId: 'tec', weekday, startTime: '18:10', endTime: '19:50', location: 'Sala 204', enabled: true, intervalWeeks: 1 },
    { id: 'c2', subjectId: 'ml', weekday, startTime: '20:00', location: '', enabled: true, intervalWeeks: 1 },
  ] as Workspace['classes'],
  notes: [{ id: 'n1', title: 'Reflexão sobre entrevista', content: '<p>texto</p>', subjectId: '', updatedAt: '2026-10-06T10:00:00Z' }] });
type Entry = { title: string; course: string | null; professor: string | null; time: string | null; endTime: string | null; location: string | null; subject: string | null };

test('"qual a aula de hoje?" traz as aulas de cada curso, para a IA perguntar o curso só se houver mais de um', () => {
  const result = queryWorkspace(data(), { section: 'agenda', from: today, to: today }, today) as { items: Entry[] };
  assert.deepEqual(result.items.map(item => item.course), ['Psicologia', 'Inteligência Artificial']);
});

test('"qual o professor da aula das 18:10?" sai numa consulta só, e o que falta vem como não cadastrado', () => {
  const psychology = queryWorkspace(data(), { section: 'agenda', from: today, to: today, search: 'psicologia' }, today) as { items: Entry[] };
  assert.equal(psychology.items.length, 1);
  assert.deepEqual(psychology.items[0], { ...psychology.items[0], title: 'Técnicas de Entrevista e Observação', time: '18:10', endTime: '19:50',
    professor: 'Leonardo', course: 'Psicologia', subject: 'Técnicas de Entrevista e Observação', location: 'Sala 204' });
  const ai = queryWorkspace(data(), { section: 'agenda', from: today, to: today, search: 'inteligência' }, today) as { items: Entry[] };
  assert.deepEqual([ai.items[0].professor, ai.items[0].location, ai.items[0].endTime], [null, null, null], 'null = não cadastrado, nunca inventado');
  const classes = queryWorkspace(data(), { section: 'aula' }, today) as { items: Record<string, unknown>[] };
  assert.deepEqual([classes.items[0].professor, classes.items[0].course, classes.items[0].weekdayName], ['Leonardo', 'Psicologia', 'quarta']);
  const subjects = queryWorkspace(data(), { section: 'materia' }, today) as { items: Record<string, unknown>[] };
  assert.deepEqual(subjects.items.map(item => [item.course, item.professor]), [['Psicologia', 'Leonardo'], ['Inteligência Artificial', null]]);
});

test('busca geral procura em todas as seções, e o que não existe vem como "não encontrei" com o lugar procurado', () => {
  const found = queryWorkspace(data(), { section: 'busca', search: 'entrevista' }, today) as { found: number; items: { section: string; id: string }[] };
  assert.deepEqual(found.items.map(item => [item.section, item.id]), [['anotacao', 'n1'], ['materia', 'tec'], ['aula', 'c1']]);
  assert.deepEqual((queryWorkspace(data(), { section: 'busca', search: 'Leonardo' }, today) as { items: { id: string }[] }).items.map(item => item.id), ['tec'], 'professor também é encontrado');
  const missing = queryWorkspace(data(), { section: 'busca', search: 'Neurociência' }, today) as { found: number; message: string };
  assert.equal(missing.found, 0);
  assert.match(missing.message, /^Não encontrei "Neurociência"\. Procurei em: compromisso, anotacao, financeiro/);
  const noBills = queryWorkspace(data(), { section: 'financeiro' }, today) as { found: number; message: string };
  assert.match(noBills.message, /Procurei em: financeiro/);
  assert.throws(() => queryWorkspace(data(), { section: 'busca' }, today), /Diga o que procurar/);
});

test('pendentes junta o que espera organização, cada grupo com total', () => {
  const start = { ...data(),
    tasks: [{ id: 't-late', title: 'Ler capítulo 2', subjectId: 'tec', date: '2026-10-01', kind: 'Estudo', done: false, minutes: 25 },
      { id: 't-ok', title: 'Hoje', subjectId: '', date: today, kind: 'Tarefa', done: false, minutes: 10 }],
    transactions: [
      { id: 'f1', description: 'Luz', amountCents: 12000, type: 'expense', category: 'Moradia', date: '2026-10-05', status: 'pending' },
      { id: 'f2', description: 'Pix', amountCents: 5000, type: 'income', category: 'Outros', date: '2026-10-06', status: 'paid' },
    ] } as Workspace;
  const result = queryWorkspace(start, { section: 'pendentes' }, today) as unknown as Record<string, { total: number; items: Record<string, unknown>[] }> & { found: number };
  assert.equal(result.anotacoesParaOrganizar.total, 1);
  assert.equal(result.compromissosAtrasados.items[0].id, 't-late');
  assert.equal(result.compromissosAtrasados.items[0].professor, 'Leonardo');
  assert.equal(result.contasVencidas.items[0].amountInReais, 120);
  assert.equal(result.lancamentosSemCategoria.items[0].id, 'f2');
  assert.equal(result.found, 4);
  const clean = queryWorkspace({ ...emptyWorkspace() }, { section: 'pendentes' }, today) as unknown as { found: number; message: string };
  assert.equal(clean.found, 0);
  assert.match(clean.message, /Nada pendente/);
});

test('consulta de anotações diz onde cada uma está; cadernos dizem quantas têm', () => {
  const start = { ...data(), notebooks: [{ id: 'nb-out', name: 'Caderno outubro', areaId: '', color: 'sage' }],
    notes: [{ id: 'n1', title: 'O Modelo Biopsicossocial', content: '', subjectId: 'tec', areaId: 'studies', notebookId: '', updatedAt: '2026-10-07T10:00:00Z' },
      { id: 'n2', title: 'Solta', content: '', subjectId: '', areaId: '', notebookId: '', updatedAt: '2026-10-07T09:00:00Z' }] } as Workspace;
  const notes = queryWorkspace(start, { section: 'anotacao' }, today) as unknown as { items: { id: string; lugar: string; tipoDeLugar: string }[] };
  assert.deepEqual(notes.items.map(item => [item.id, item.lugar, item.tipoDeLugar]), [
    ['n1', 'Estudos › Psicologia › Técnicas de Entrevista e Observação', 'matéria'], ['n2', 'Para organizar', 'Para organizar']]);
  const books = queryWorkspace(start, { section: 'caderno' }, today) as unknown as { items: { name: string; anotacoes: number }[] };
  assert.equal(books.items[0].anotacoes, 0, 'o Caderno outubro está vazio, e a consulta diz isso');
});
