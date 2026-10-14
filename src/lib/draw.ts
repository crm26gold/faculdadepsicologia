/** Sorteio justo, feito no aparelho: o embaralhamento usa números aleatórios do sistema (crypto), sem viés. */
export type Random = (max: number) => number; // um inteiro de 0 a max - 1

export const cryptoRandom: Random = max => {
  if (max <= 1) return 0;
  // Descarta o resto que deixaria alguns números mais prováveis que outros.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % max;
};

/** Fisher–Yates: toda ordem tem a mesma chance. */
export function shuffle<T>(items: readonly T[], random: Random = cryptoRandom): T[] {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

/** Divide em grupos de tamanhos que diferem no máximo em 1. Pelo número de grupos ou pelo tamanho de cada um. */
export function splitGroups<T>(items: readonly T[], by: { groups: number } | { size: number }, random: Random = cryptoRandom): T[][] {
  const count = 'groups' in by ? by.groups : Math.ceil(items.length / Math.max(1, by.size));
  const total = Math.max(1, Math.min(count, items.length));
  const groups: T[][] = Array.from({ length: total }, () => []);
  shuffle(items, random).forEach((item, index) => groups[index % total].push(item));
  return groups;
}

/** Distribui as tarefas: cada uma vai para quem tem menos até ali (o que já tinha conta); empate se decide no sorteio. */
export function distribute<T, P>(tasks: readonly T[], people: readonly P[], random: Random = cryptoRandom, load = new Map<P, number>()) {
  if (!people.length) return [];
  const order = shuffle(people, random);
  const counts = new Map(order.map(person => [person, load.get(person) ?? 0]));
  return tasks.map(task => {
    const person = order.reduce((best, item) => counts.get(item)! < counts.get(best)! ? item : best, order[0]);
    counts.set(person, counts.get(person)! + 1);
    return { task, person };
  });
}

/** Uma linha por nome; vazios saem. Até 200. */
export const namesFrom = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 200);
