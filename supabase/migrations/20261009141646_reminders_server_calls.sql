-- Avisos: as chamadas do servidor saem pela chave pública (papel anon), que não entra no esquema private. Como as
-- demais funções do robô (bot_settings), os invólucros públicos protegidos pelo segredo do servidor rodam como dono.
alter function public.reminders_clock_ok(text, text) security definer;
alter function public.reminders_claim(text, uuid, integer) security definer;
alter function public.reminders_finish(text, uuid, integer, jsonb) security definer;
alter function public.push_drop(text, text) security definer;
alter function public.reminder_outbox_add(text, uuid, text, text) security definer;
alter function public.reminder_outbox_take(text) security definer;
alter function public.reminder_outbox_sent(text, uuid) security definer;
