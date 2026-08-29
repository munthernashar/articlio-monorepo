begin;

-- Munthers Feature-Anfrage 26.08.2026: Lernpfade / Prüfungsziele. Nutzer wählen im
-- Profil ein konkretes Ziel (Einbürgerung, Fachsprachprüfung Ärzte, etc.), Prompts
-- und Fortschrittsanzeige richten sich danach aus. Gleiches Katalog-Muster wie
-- billing_plan_catalog: admin-kuratierte, öffentlich lesbare Tabelle, Schreiben nur
-- via Migration (kein Admin-UI nötig für einen selten geänderten Katalog).
--
-- goal_type unterscheidet zwei fachlich unterschiedliche Ziel-Arten:
-- 'language_level'  -- CEFR-Band-Ziel, nutzt die vorhandene Skill-Map/CEFR-Maschinerie
-- 'knowledge'        -- Wissenstest (aktuell nur "Leben in Deutschland"), kein CEFR-Ziel,
--                       eigener Fortschrittsmechanismus (Themen-Abdeckung), siehe
--                       eigene, spätere Phase E im Plan-Dokument.
create table if not exists public.learning_goal_catalog (
  goal_key text primary key,
  display_name text not null,
  category text not null,
  goal_type text not null default 'language_level',
  target_cefr_band text,
  description text not null,
  focus_areas jsonb not null default '[]'::jsonb,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint learning_goal_catalog_goal_key_length check (char_length(trim(goal_key)) between 2 and 80),
  constraint learning_goal_catalog_display_name_length check (char_length(trim(display_name)) between 2 and 120),
  constraint learning_goal_catalog_category_allowed check (category in ('integration', 'beruf', 'familie', 'allgemein')),
  constraint learning_goal_catalog_goal_type_allowed check (goal_type in ('language_level', 'knowledge')),
  constraint learning_goal_catalog_target_cefr_band_allowed check (
    target_cefr_band is null or target_cefr_band in (
      'A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2', 'C2'
    )
  ),
  constraint learning_goal_catalog_description_length check (char_length(trim(description)) between 2 and 500),
  constraint learning_goal_catalog_focus_areas_array check (jsonb_typeof(focus_areas) = 'array')
);

create trigger trg_learning_goal_catalog_set_updated_at
before update on public.learning_goal_catalog
for each row execute procedure public.set_updated_at();

create index if not exists idx_learning_goal_catalog_active_sort
  on public.learning_goal_catalog (is_active, sort_order, display_name);

alter table public.learning_goal_catalog enable row level security;
alter table public.learning_goal_catalog force row level security;

create policy "learning_goal_catalog_read_all"
on public.learning_goal_catalog
for select
using (true);

insert into public.learning_goal_catalog (
  goal_key, display_name, category, goal_type, target_cefr_band, description, focus_areas, sort_order, is_active
)
values
  (
    'dtz',
    'Deutsch-Test für Zuwanderer (DTZ)',
    'integration',
    'language_level',
    'B1.1',
    'Abschlusstest des Integrationskurs-Sprachmoduls (Niveaustufen A2/B1). Zusammen mit dem "Leben in Deutschland"-Test Grundlage für das Zertifikat Integrationskurs.',
    '["Alltagsgespräche", "Behördensituationen", "Arbeitsleben"]'::jsonb,
    10,
    true
  ),
  (
    'einbuergerung_b1',
    'Einbürgerung (Sprachteil)',
    'integration',
    'language_level',
    'B1.2',
    'Sprachnachweis B1 in allen vier Fertigkeiten für die Einbürgerung (Goethe-Zertifikat B1, telc Deutsch B1, ÖSD Zertifikat B1 oder DTZ mit B1-Ergebnis).',
    '["Alltagsgespräche", "Meinungen äußern", "Behördensituationen"]'::jsonb,
    20,
    true
  ),
  (
    'ehegattennachzug_a1',
    'Ehegattennachzug',
    'familie',
    'language_level',
    'A1.2',
    'Einfache Deutschkenntnisse (A1) als Voraussetzung für das Visum zum Ehegattennachzug, meist vor der Einreise nachzuweisen.',
    '["Sich vorstellen", "Einfache Alltagssituationen", "Familie und Wohnen"]'::jsonb,
    30,
    true
  ),
  (
    'fsp_aerzte',
    'Fachsprachprüfung Ärzte',
    'beruf',
    'language_level',
    'C1.2',
    'Medizinische Fachsprachprüfung (FSP) der Landesärztekammern, Voraussetzung für die Approbation. Prüft klinische Kommunikation.',
    '["Anamnesegespräch", "Patientenübergabe", "Arztbrief", "Aufklärungsgespräch"]'::jsonb,
    40,
    true
  ),
  (
    'pflege_b1_b2',
    'telc Deutsch B1-B2 Pflege',
    'beruf',
    'language_level',
    'B2.1',
    'Zweistufige Prüfung für Pflegekräfte (B1/B2), Pflegefachsprache und Patientengespräch-Szenarien, national anerkannt für die Berufsanerkennung.',
    '["Übergabegespräch", "Patientengespräch", "Pflegedokumentation"]'::jsonb,
    50,
    true
  ),
  (
    'allgemein_zertifikat',
    'Allgemeines Zertifikat (Goethe/telc)',
    'allgemein',
    'language_level',
    null,
    'Standard-Sprachzertifikat ohne Berufsbezug (B1, B2 oder C1) - das Ziel-Niveau ergibt sich aus deinem aktuell gewählten Deutsch-Niveau im Profil.',
    '[]'::jsonb,
    60,
    true
  ),
  (
    'leben_in_deutschland',
    'Leben in Deutschland',
    'integration',
    'knowledge',
    null,
    'Wissenstest zu Politik, Geschichte und Gesellschaft (33 von 310 offiziellen BAMF-Fragen, davon 10 landesspezifisch). Kein Sprachniveau-Ziel - der Coach lässt dich die Antworten mündlich in eigenen Worten erklären.',
    '["Grundrechte", "Bundestag und Wahlen", "Föderalismus", "Geschichte", "Gleichberechtigung"]'::jsonb,
    70,
    true
  )
on conflict (goal_key) do update
set
  display_name = excluded.display_name,
  category = excluded.category,
  goal_type = excluded.goal_type,
  target_cefr_band = excluded.target_cefr_band,
  description = excluded.description,
  focus_areas = excluded.focus_areas,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

comment on table public.learning_goal_catalog is 'Katalog wählbarer Prüfungs-/Lernziele für die Profil-Auswahl; steuert Prompt-Kontext und Fortschritts-Zielmarker.';
comment on column public.learning_goal_catalog.goal_type is 'language_level = CEFR-Band-Ziel (Skill-Map-Tick), knowledge = Wissenstest ohne CEFR-Ziel (eigener Fortschrittsmechanismus).';

alter table public.profiles
  add column if not exists learning_goal_key text;

alter table public.profiles
  add constraint profiles_learning_goal_key_length
  check (learning_goal_key is null or char_length(trim(learning_goal_key)) between 2 and 80);

comment on column public.profiles.learning_goal_key is 'Optionale Referenz auf learning_goal_catalog.goal_key (kein Hard-FK, gleiche Konvention wie user_entitlements.plan_key). Null = kein spezifisches Ziel gewählt.';

commit;
