-- Sprint 1 + Sprint 2: partner integration contract and foundation tables

create table if not exists public.partner_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),
  api_key_hash text not null,
  webhook_secret text not null,
  webhook_url text not null
    check (webhook_url ~ '^https?://'),
  pricing_mode text not null default 'partner_submitted'
    check (pricing_mode in ('partner_submitted', 'fixed')),
  fixed_price_amount numeric(12,2)
    check (fixed_price_amount is null or fixed_price_amount >= 0),
  dispatch_ttl_minutes integer not null default 15
    check (dispatch_ttl_minutes between 1 and 1440),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_accounts_slug_lower_key
  on public.partner_accounts (lower(slug));

create unique index if not exists partner_accounts_api_key_hash_key
  on public.partner_accounts (api_key_hash);

create table if not exists public.partner_deliveries (
  id uuid primary key default gen_random_uuid(),
  partner_account_id uuid not null references public.partner_accounts(id) on delete cascade,
  external_order_id text not null,
  external_reference text null,
  idempotency_key text not null,
  request_fingerprint text not null,
  dzpatch_order_id uuid null references public.orders(id) on delete set null,
  status text not null default 'accepted'
    check (status in (
      'accepted',
      'rider_assigned',
      'arrived_pickup',
      'picked_up',
      'in_transit',
      'arrived_dropoff',
      'delivered',
      'cancelled',
      'failed',
      'failed_no_rider'
    )),
  request_payload jsonb not null,
  response_payload jsonb null,
  submitted_fee numeric(12,2) not null check (submitted_fee >= 0),
  applied_fee numeric(12,2) not null check (applied_fee >= 0),
  pricing_source text not null
    check (pricing_source in ('partner_submitted', 'partner_contract')),
  delivery_code text null
    check (delivery_code is null or delivery_code ~ '^\d{6}$'),
  delivery_code_status text not null default 'active'
    check (delivery_code_status in ('active', 'used', 'expired')),
  delivery_code_generated_at timestamptz null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error jsonb null,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_account_id, external_order_id),
  unique (partner_account_id, idempotency_key)
);

create index if not exists idx_partner_deliveries_partner_status
  on public.partner_deliveries (partner_account_id, status, created_at desc);

create index if not exists idx_partner_deliveries_dzpatch_order
  on public.partner_deliveries (dzpatch_order_id);

create index if not exists idx_partner_deliveries_delivery_code
  on public.partner_deliveries (delivery_code);

create table if not exists public.partner_webhook_events (
  id uuid primary key default gen_random_uuid(),
  partner_account_id uuid not null references public.partner_accounts(id) on delete cascade,
  partner_delivery_id uuid not null references public.partner_deliveries(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  sequence_version bigint not null check (sequence_version > 0),
  payload jsonb not null,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  next_retry_at timestamptz null,
  last_delivery_at timestamptz null,
  last_delivery_error jsonb null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id),
  unique (partner_delivery_id, sequence_version)
);

create index if not exists idx_partner_webhook_events_retry
  on public.partner_webhook_events (status, next_retry_at, created_at);

create table if not exists public.partner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  partner_account_id uuid null references public.partner_accounts(id) on delete set null,
  action text not null,
  actor_type text not null
    check (actor_type in ('partner', 'admin', 'service', 'system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_audit_logs_partner_created
  on public.partner_audit_logs (partner_account_id, created_at desc);

alter table if exists public.partner_deliveries
  add column if not exists delivery_code text null
    check (delivery_code is null or delivery_code ~ '^\d{6}$');

alter table if exists public.partner_deliveries
  add column if not exists delivery_code_status text not null default 'active'
    check (delivery_code_status in ('active', 'used', 'expired'));

alter table if exists public.partner_deliveries
  add column if not exists delivery_code_generated_at timestamptz null;

drop trigger if exists set_updated_at on public.partner_accounts;
create trigger set_updated_at
before update on public.partner_accounts
for each row execute function public.update_updated_at_column();

drop trigger if exists set_updated_at on public.partner_deliveries;
create trigger set_updated_at
before update on public.partner_deliveries
for each row execute function public.update_updated_at_column();

drop trigger if exists set_updated_at on public.partner_webhook_events;
create trigger set_updated_at
before update on public.partner_webhook_events
for each row execute function public.update_updated_at_column();

grant select, insert, update on public.partner_accounts to authenticated;
grant all on public.partner_accounts to service_role;

grant select, insert, update on public.partner_deliveries to authenticated;
grant all on public.partner_deliveries to service_role;

grant select, insert, update on public.partner_webhook_events to authenticated;
grant all on public.partner_webhook_events to service_role;

grant select on public.partner_audit_logs to authenticated;
grant insert on public.partner_audit_logs to authenticated;
grant all on public.partner_audit_logs to service_role;

alter table public.partner_accounts enable row level security;
alter table public.partner_deliveries enable row level security;
alter table public.partner_webhook_events enable row level security;
alter table public.partner_audit_logs enable row level security;

create policy partner_accounts_admin_select
  on public.partner_accounts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_accounts_admin_insert
  on public.partner_accounts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_accounts_admin_update
  on public.partner_accounts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_deliveries_admin_select
  on public.partner_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_deliveries_admin_update
  on public.partner_deliveries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_webhook_events_admin_select
  on public.partner_webhook_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_webhook_events_admin_update
  on public.partner_webhook_events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

create policy partner_audit_logs_admin_select
  on public.partner_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );
