import { z } from 'zod';
import { daySchema } from './workspace';
import { commandAction, type Applied, type PendingCommand } from './commands';
import type { ConfirmablePending } from './confirmable';

export const proposedActions = z.array(commandAction).min(1).max(8);

export const jobInputSchema = z.object({ message: z.string().trim().min(1).max(2000), today: daySchema,
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(3000) })).max(12).default([]),
  actions: proposedActions.optional() });
// A confirmation can hold personal changes and collective deletions proposed by an assistant.
export type PendingItem = PendingCommand | ConfirmablePending;
export type JobOutcome = { saved: boolean; reply: string; applied: Applied[]; pending: PendingItem[]; failed: string[]; model?: string; execution?: 'structured' | 'planned' };
export type AssistantJob = { id: string; conversation_id: string; status: 'queued' | 'working' | 'done' | 'needs_confirmation' | 'failed'; input: z.infer<typeof jobInputSchema>; result: JobOutcome | null; created_at: string; updated_at: string };
export const jobFinished = (job: AssistantJob) => ['done', 'needs_confirmation', 'failed'].includes(job.status);
export const jobCanResume = (job: AssistantJob, now = Date.now()) => job.status === 'failed' || job.status === 'queued' || (job.status === 'working' && now - Date.parse(job.updated_at) > 90_000);
// Confirmations still waiting, for Meu dia: the first action label and when it was requested, in the
// query's order (newest first). History, fingerprints and undo data stay on the server.
export type WaitingRequest = { id: string; conversationId: string; requestedAt: string; summary: string; more: number };
export const waitingRequests = (jobs: Pick<AssistantJob, 'id' | 'conversation_id' | 'status' | 'result' | 'created_at'>[]): WaitingRequest[] =>
  jobs.flatMap(job => job.status === 'needs_confirmation' && typeof job.result?.pending?.[0]?.label === 'string'
    ? [{ id: job.id, conversationId: job.conversation_id, requestedAt: job.created_at, summary: job.result.pending[0].label.slice(0, 160), more: job.result.pending.length - 1 }] : []);
