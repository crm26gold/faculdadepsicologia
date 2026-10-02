export type Turn = { role: 'user' | 'assistant'; text: string };
/** The conversation so far plus the new message, alternating and starting with the person, as every provider requires. */
export function conversationTurns(history: Turn[] = [], prompt: string): Turn[] {
  const turns: Turn[] = [];
  for (const turn of [...history, { role: 'user' as const, text: prompt }]) {
    const text = turn.text.trim();
    if (!text || (!turns.length && turn.role === 'assistant')) continue;
    const last = turns.at(-1);
    if (last?.role === turn.role) last.text = `${last.text}\n${text}`;
    else turns.push({ role: turn.role, text });
  }
  return turns;
}
