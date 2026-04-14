-- Nudge the partner webhook dispatcher immediately when a new event is queued.
-- The minute cron remains as a backup sweeper for retries and missed nudges.

create or replace function public.nudge_partner_webhook_dispatcher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending'
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := 'https://fgegxqtynigdceuxjnxd.functions.supabase.co/partner-webhook-dispatcher',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('event_id', new.id)
    );
  end if;

  return new;
exception when others then
  -- Webhook enqueue must not fail the delivery state transition.
  return new;
end;
$$;

drop trigger if exists nudge_partner_webhook_dispatcher_after_insert
  on public.partner_webhook_events;

create trigger nudge_partner_webhook_dispatcher_after_insert
after insert on public.partner_webhook_events
for each row
execute function public.nudge_partner_webhook_dispatcher();
