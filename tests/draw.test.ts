import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cryptoRandom, distribute, namesFrom, shuffle, splitGroups, type Random } from '../src/lib/draw';

// Sequência previsível para conferir a lógica; o app usa o aleatório do sistema.
const fixed = (...values: number[]): Random => { let index = 0; return max => values[index++ % values.length] % max; };

test('sorteio: embaralha sem perder nem repetir ninguém', () => {
  const people = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva'];
  for (let round = 0; round < 50; round++) assert.deepEqual(shuffle(people).toSorted(), people.toSorted());
  assert.deepEqual(shuffle(people, fixed(0)), ['Bia', 'Caio', 'Duda', 'Eva', 'Ana']);
  assert.deepEqual(shuffle([], cryptoRandom), []);
});

test('sorteio: cada ordem tem chance parecida (sem viés)', () => {
  const seen = new Map<string, number>();
  for (let round = 0; round < 6000; round++) { const key = shuffle(['a', 'b', 'c']).join(''); seen.set(key, (seen.get(key) ?? 0) + 1); }
  assert.equal(seen.size, 6);
  for (const count of seen.values()) assert.ok(count > 800 && count < 1200, `ordem com ${count} de 6000`);
  for (let round = 0; round < 1000; round++) { const value = cryptoRandom(7); assert.ok(value >= 0 && value < 7 && Number.isInteger(value)); }
});

test('sorteio: grupos com tamanhos que diferem no máximo em 1', () => {
  const people = Array.from({ length: 10 }, (_, index) => `P${index}`);
  assert.deepEqual(splitGroups(people, { groups: 3 }).map(group => group.length).toSorted(), [3, 3, 4]);
  assert.deepEqual(splitGroups(people, { size: 3 }).map(group => group.length).toSorted(), [2, 2, 3, 3]);
  assert.equal(splitGroups(people, { groups: 20 }).length, 10, 'nunca grupo vazio');
  assert.deepEqual(splitGroups(people, { groups: 3 }).flat().toSorted(), people.toSorted());
});

test('sorteio: tarefas vão para quem tem menos, contando o que já tinha', () => {
  const result = distribute(['Introdução', 'Método', 'Resultados', 'Conclusão'], ['Ana', 'Bia', 'Caio'], fixed(1, 0), new Map([['Ana', 2]]));
  const count = (name: string) => result.filter(item => item.person === name).length;
  assert.equal(count('Ana'), 0, 'Ana já tinha duas partes');
  assert.equal(count('Bia') + count('Caio'), 4);
  assert.ok(Math.abs(count('Bia') - count('Caio')) <= 1);
  assert.deepEqual(distribute(['x'], []), []);
});

test('sorteio: nomes um por linha, sem vazios, até 200', () => {
  assert.deepEqual(namesFrom(' Ana \n\nBia\n  \nCaio'), ['Ana', 'Bia', 'Caio']);
  assert.equal(namesFrom(Array.from({ length: 300 }, (_, index) => `N${index}`).join('\n')).length, 200);
});
