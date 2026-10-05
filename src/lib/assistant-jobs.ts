import { z } from 'zod';
import { daySchema } from './workspace';
import { commandAction, type Applied, type PendingCommand } from './commands';

export const proposedActions = z.array(commandAction).min(1).max(8);

export const jobInputSchema = z.object({ message: z.string().trim().min(1).max(2000), today: daySchema,
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(3000) })).max(12).default([]),
  actions: proposedActions.optional() });
export type JobOutcome = { saved: boolean; reply: string; applied: Applied[]; pending: PendingCommand[]; failed: string[]; model?: string; execution?: 'structured' | 'planned' };
export type AssistantJob = { id: string; conversation_id: string; status: 'queued' | 'working' | 'done' | 'needs_confirmation' | 'failed'; input: z.infer<typeof jobInputSchema>; result: JobOutcome | null; created_at: string; updated_at: string };
export const jobFinished = (job: AssistantJob) => ['done', 'needs_confirmation', 'failed'].includes(job.status);
export const jobCanResume = (job: AssistantJob, now = Date.now()) => job.status === 'failed' || job.status === 'queued' || (job.status === 'working' && now - Date.parse(job.updated_at) > 90_000);
