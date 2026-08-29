begin;

alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

comment on column public.profiles.timezone is 'Bevorzugte IANA-Zeitzone des Users (z. B. Europe/Berlin).';

commit;
