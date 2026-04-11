# Source Of Truth

Current remote public-schema source of truth:
[20260408223000_remote_schema.sql](C:/Dev/dzpatch-v2/supabase/migrations/20260408223000_remote_schema.sql)

Historical local and older remote SQL snapshots:
[archive_local_2026-04-08](C:/Dev/dzpatch-v2/supabase/migrations/archive_local_2026-04-08)

Important caveat:
this dump reflects the remote `public` schema only. It is the right working source of truth for app tables, triggers, functions, and RLS in `public`, but it is not a full export of every Supabase-managed internal schema.
