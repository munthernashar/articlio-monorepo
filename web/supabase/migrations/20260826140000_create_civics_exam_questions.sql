begin;

-- Lernpfade Phase E (26.08.2026): Fragenpool für das Ziel "Leben in
-- Deutschland" (goal_type 'knowledge' in learning_goal_catalog). Gleiches
-- Katalog-Muster wie billing_plan_catalog/learning_goal_catalog:
-- admin-kuratierte, öffentlich lesbare Tabelle, Schreiben nur via Migration.
--
-- WICHTIG: Diese Migration legt ausschließlich das Datenmodell an. Der
-- offizielle BAMF-Gesamtfragenkatalog wird NICHT in dieser Migration
-- befüllt -- die Sandbox-Umgebung hat keinen Zugriff auf externe Webseiten
-- (bamf.de und alle geprüften Alternativquellen sind vom Netzwerk-Egress
-- blockiert). Der Nutzer liefert die offizielle PDF-Quelldatei separat; die
-- eigentliche Inhalts-Migration mit den ~460 echten Fragen (300 allgemeine +
-- 16 Bundesländer x 10 landesspezifische) folgt als eigener, gegen die Quelle
-- geprüfter Schritt (siehe Plan-Dokument Phase E, Schritt 1).
create table if not exists public.civics_exam_questions (
  id uuid primary key default gen_random_uuid(),
  -- Nummer/Kennung aus dem offiziellen BAMF-Katalog (z. B. "1" für allgemeine
  -- Fragen, "BW-3" für landesspezifische) -- ermöglicht Rückverfolgung zur Quelle.
  external_number text not null,
  scope text not null default 'general',
  bundesland text,
  -- Freitext statt festem Enum: die tatsächliche Themen-Taxonomie wird erst
  -- beim Einlesen der echten Quelle bekannt (siehe Hinweis oben).
  topic_category text,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null,
  source_citation text not null default 'BAMF Gesamtfragenkatalog "Leben in Deutschland"',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint civics_exam_questions_external_number_length check (char_length(trim(external_number)) between 1 and 20),
  constraint civics_exam_questions_scope_allowed check (scope in ('general', 'bundesland')),
  constraint civics_exam_questions_bundesland_allowed check (
    bundesland is null or bundesland in (
      'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
      'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
      'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'
    )
  ),
  constraint civics_exam_questions_scope_bundesland_consistency check (
    (scope = 'general' and bundesland is null) or (scope = 'bundesland' and bundesland is not null)
  ),
  constraint civics_exam_questions_question_text_length check (char_length(trim(question_text)) between 2 and 500),
  constraint civics_exam_questions_option_a_length check (char_length(trim(option_a)) between 1 and 300),
  constraint civics_exam_questions_option_b_length check (char_length(trim(option_b)) between 1 and 300),
  constraint civics_exam_questions_option_c_length check (char_length(trim(option_c)) between 1 and 300),
  constraint civics_exam_questions_option_d_length check (char_length(trim(option_d)) between 1 and 300),
  constraint civics_exam_questions_correct_option_allowed check (correct_option in ('a', 'b', 'c', 'd')),
  constraint civics_exam_questions_source_citation_length check (char_length(trim(source_citation)) between 2 and 300),
  constraint civics_exam_questions_scope_bundesland_number_unique unique (scope, bundesland, external_number)
);

create trigger trg_civics_exam_questions_set_updated_at
before update on public.civics_exam_questions
for each row execute procedure public.set_updated_at();

create index if not exists idx_civics_exam_questions_active_scope
  on public.civics_exam_questions (is_active, scope, bundesland, sort_order);

alter table public.civics_exam_questions enable row level security;
alter table public.civics_exam_questions force row level security;

create policy "civics_exam_questions_read_all"
on public.civics_exam_questions
for select
using (true);

comment on table public.civics_exam_questions is 'Fragenpool für das Lernziel "Leben in Deutschland" (learning_goal_catalog.goal_key = leben_in_deutschland). Admin-kuratiert wie billing_plan_catalog/learning_goal_catalog, Schreiben nur via Migration. Zum Zeitpunkt dieser Migration noch ohne echten BAMF-Inhalt befüllt, siehe Tabellen-Migrationskommentar.';
comment on column public.civics_exam_questions.external_number is 'Nummer/Kennung aus dem offiziellen BAMF-Gesamtfragenkatalog zur Rückverfolgung.';
comment on column public.civics_exam_questions.scope is 'general = bundesweite Frage (300 im Katalog), bundesland = landesspezifische Frage (10 je Bundesland).';

-- Damit der Coach bei gesetztem Ziel "Leben in Deutschland" auf die zum
-- Bundesland des Nutzers passenden 10 landesspezifischen Fragen zugreifen
-- kann. Nullable/soft, gleiche Konvention wie profiles.learning_goal_key --
-- ohne gesetztes Bundesland werden nur die 300 allgemeinen Fragen genutzt.
alter table public.profiles
  add column if not exists bundesland text;

alter table public.profiles
  add constraint profiles_bundesland_allowed
  check (
    bundesland is null or bundesland in (
      'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
      'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
      'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'
    )
  );

comment on column public.profiles.bundesland is 'Optionales Bundesland des Nutzers, für landesspezifische Fragen im Ziel "Leben in Deutschland". Null = nur allgemeine Fragen.';

commit;
