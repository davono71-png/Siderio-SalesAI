-- request_attachments non aveva mai ricevuto il grant esplicito a
-- service_role che tutte le altre tabelle di sales_ai hanno (request_events,
-- requests, ...): creata dopo, non ha ereditato i privilegi di default.
-- Bug reale scoperto al primo giro pg_cron riuscito ad autenticarsi:
-- "permission denied for table request_attachments".
grant select, insert, update, delete, references, trigger, truncate
  on sales_ai.request_attachments to service_role;
