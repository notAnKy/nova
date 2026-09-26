-- Nova deployment: hourly Storage cleanup. The token stays in the private database table.
-- On a different Supabase project, replace only the URL before applying this migration.
select cron.schedule('nova-attachment-cleanup-hourly', '17 * * * *',
  $job$
  select net.http_post(
    url := 'https://bowkdnxhnqdncohnsgls.supabase.co/functions/v1/cleanup-attachments',
    headers := jsonb_build_object('content-type','application/json','x-cleanup-token',
      (select token from nova_private.attachment_cleanup_config where id = true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$);
