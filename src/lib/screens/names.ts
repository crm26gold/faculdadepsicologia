// The screens an assistant can show or "print", and the app view each one opens.
export const screens = ['meu_dia', 'financas', 'agenda', 'habitos', 'metas', 'anotacoes'] as const;
export type Screen = typeof screens[number];
export const screenViews = { meu_dia: 'today', financas: 'finances', agenda: 'agenda', habitos: 'routine', metas: 'planning', anotacoes: 'notes' } as const;
export const screenNames = { meu_dia: 'Meu dia', financas: 'Finanças', agenda: 'Agenda', habitos: 'Rotina', metas: 'Planejamento', anotacoes: 'Caderno' } as const;
/** The screen that shows a change made in an app view; views without their own print open on Meu dia. */
export const screenOfView = (view: string): Screen => (Object.entries(screenViews).find(([, item]) => item === view)?.[0] as Screen | undefined) ?? 'meu_dia';
