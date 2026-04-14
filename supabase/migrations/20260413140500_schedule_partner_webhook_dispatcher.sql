-- Keep partner webhook events moving without manual intervention.
-- The dispatcher is idempotent and only processes pending/retry-due events.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      perform cron.unschedule('partner-webhook-dispatcher');
    exception when others then
      null;
    end;

    perform cron.schedule(
      'partner-webhook-dispatcher',
      '* * * * *',
      $job$
      select net.http_post(
        url := 'https://fgegxqtynigdceuxjnxd.functions.supabase.co/partner-webhook-dispatcher',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $job$
    );
  end if;
end
$$;
