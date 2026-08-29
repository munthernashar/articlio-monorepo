begin;

-- Lernpfade Phase F (27.08.2026): Badge/Erfolg, wenn ein Nutzer sein gewähltes
-- Lernziel erreicht (alle 7 Kompetenzbereiche auf Ziel-CEFR-Band bzw. 100%
-- Themen-Abdeckung bei "Leben in Deutschland"). Das Ziel selbst bleibt danach
-- aktiv und wählbar (profiles.learning_goal_key ändert sich nicht automatisch)
-- -- diese Tabelle ist nur die dauerhafte Erfolgs-Historie fürs Profil.
create table if not exists public.user_goal_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_key text not null references public.learning_goal_catalog (goal_key),
  achieved_at timestamptz not null default timezone('utc', now()),
  constraint user_goal_achievements_user_goal_unique unique (user_id, goal_key)
);

create index if not exists idx_user_goal_achievements_user
  on public.user_goal_achievements (user_id, achieved_at desc);

alter table public.user_goal_achievements enable row level security;
alter table public.user_goal_achievements force row level security;

create policy "user_goal_achievements_select_own_or_admin"
on public.user_goal_achievements
for select
using (auth.uid() = user_id or public.is_admin());

create policy "user_goal_achievements_insert_own"
on public.user_goal_achievements
for insert
with check (auth.uid() = user_id);

comment on table public.user_goal_achievements is 'Dauerhafte Erfolgs-Historie: wann ein Nutzer ein Lernziel aus learning_goal_catalog erreicht hat (Badge im Profil). Unique(user_id, goal_key) verhindert Duplikate bei mehrfacher Zielerreichung; das Ziel selbst bleibt in profiles.learning_goal_key unverändert aktiv.';

commit;
