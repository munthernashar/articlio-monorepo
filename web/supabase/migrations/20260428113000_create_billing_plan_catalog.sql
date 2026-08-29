create table if not exists public.billing_plan_catalog (
  plan_key text primary key,
  display_name text not null,
  price_label text not null,
  note text not null,
  feature_flags jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_plan_catalog_plan_key_length check (char_length(trim(plan_key)) between 2 and 80),
  constraint billing_plan_catalog_display_name_length check (char_length(trim(display_name)) between 2 and 120),
  constraint billing_plan_catalog_price_label_length check (char_length(trim(price_label)) between 2 and 120),
  constraint billing_plan_catalog_note_length check (char_length(trim(note)) between 2 and 300),
  constraint billing_plan_catalog_feature_flags_object check (jsonb_typeof(feature_flags) = 'object'),
  constraint billing_plan_catalog_limits_object check (jsonb_typeof(limits) = 'object')
);

create trigger trg_billing_plan_catalog_set_updated_at
before update on public.billing_plan_catalog
for each row execute procedure public.set_updated_at();

create index if not exists idx_billing_plan_catalog_active_sort
  on public.billing_plan_catalog (is_active, sort_order, display_name);

alter table public.billing_plan_catalog enable row level security;
alter table public.billing_plan_catalog force row level security;

create policy "billing_plan_catalog_read_all"
on public.billing_plan_catalog
for select
using (true);

insert into public.billing_plan_catalog (
  plan_key,
  display_name,
  price_label,
  note,
  feature_flags,
  limits,
  sort_order,
  is_active
)
values
  (
    'starter',
    'Starter',
    '19 € / Monat',
    'Ideal für konstantes Lernen im Alltag.',
    '{"progress_overview":true,"learning_history":true,"priority_analysis":false}'::jsonb,
    '{"sessionsPerDay":3,"maxSessionLengthMinutes":15}'::jsonb,
    10,
    true
  ),
  (
    'pro',
    'Pro',
    '49 € / Monat',
    'Für intensives Sprechtraining mit höherem Volumen.',
    '{"progress_overview":true,"learning_history":true,"priority_analysis":true}'::jsonb,
    '{"sessionsPerDay":12,"maxSessionLengthMinutes":60}'::jsonb,
    20,
    true
  )
on conflict (plan_key) do update
set
  display_name = excluded.display_name,
  price_label = excluded.price_label,
  note = excluded.note,
  feature_flags = excluded.feature_flags,
  limits = excluded.limits,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

comment on table public.billing_plan_catalog is 'Zentrale Plan- und Preisdarstellung für Billing/Pricing-UI.';
comment on column public.billing_plan_catalog.price_label is 'UI-Preistext, der mit Stripe-Preisen synchron gepflegt werden muss.';
comment on column public.billing_plan_catalog.limits is 'UI-Limitdarstellung je Plan, im Idealfall synchron zu Entitlement-Defaults.';
