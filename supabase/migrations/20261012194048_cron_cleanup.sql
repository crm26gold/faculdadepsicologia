-- Faxina do relógio. O pg_cron grava cada execução em cron.job_run_details e nunca apaga nada sozinho.
-- O relógio dos lembretes roda a cada minuto (1.440 registros e cerca de 2 MB por dia): em alguns meses isso
-- chegaria ao limite de 500 MB do banco. Uma vez por dia (03:17 em São Paulo), ficam só os últimos 3 dias,
-- o bastante para investigar uma falha. Só onde o banco tem pg_cron (o Supabase); nos testes locais, nada muda.
do $faxina$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  perform cron.schedule('jornada-faxina-relogio', '17 6 * * *', $job$
    delete from cron.job_run_details where end_time < now() - interval '3 days'
  $job$);
end $faxina$;

-- A fila de envio é consultada pelo lembrete de origem (apagar ou concluir o lembrete limpa a fila dele).
create index if not exists reminder_outbox_reminder_idx on private.reminder_outbox (reminder_id);
