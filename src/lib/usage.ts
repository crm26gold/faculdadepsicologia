export type UsageScope = 'ai' | 'live' | 'upload' | 'media';
export type UsageState = {
  window_days: number;
  day_resets_at: string;
  items: { scope: UsageScope; day_used: number; day_limit: number; window_used: number; window_limit: number;
    observed_since: string; level: 'normal' | 'warning' | 'critical' | 'blocked' }[];
};
export const budgetPausedMessage = 'Esta função atingiu o limite de uso da Jornada e está pausada temporariamente. Seus registros continuam guardados.';
