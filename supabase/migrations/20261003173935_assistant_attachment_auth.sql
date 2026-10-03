-- Attachment authorization is called only by the Edge Function's platform credential.
-- The Telegram server secret and linked, claimed update are still verified in the function.
revoke all on function public.bot_attachment_owner(text, text, text) from public, anon, authenticated;
grant execute on function public.bot_attachment_owner(text, text, text) to service_role;
