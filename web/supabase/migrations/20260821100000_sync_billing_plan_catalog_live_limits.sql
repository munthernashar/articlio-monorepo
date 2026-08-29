begin;

-- Wirtschaftlichkeitsprüfung 21.08.2026 (siehe launch-readiness-audit-2026-08-14.md):
-- 3 bzw. 12 Sessions/Tag machten das Kostenrisiko bei voller Nutzung unplanbar
-- (Sessions × Länge statt fix Länge), besonders beim Pro-Plan (bis zu 12 Std.
-- Sprechzeit/Tag theoretisch möglich, aber durch nichts sinnvoll begrenzt, da
-- Transkriptionskosten nicht ans Token-Limit gekoppelt sind). Auf Munthers
-- Entscheidung: beide Pläne bekommen dieselbe, realistische Sprechzeit
-- (1 Session/Tag, 15 Minuten); der Pro-Mehrwert ist ab sofort der strukturierte
-- Coach (coach_access-Flag, durchgesetzt in TutorPage.tsx), nicht mehr Volumen.
update public.billing_plan_catalog
set
  limits = '{"sessionsPerDay":1,"maxSessionLengthMinutes":15}'::jsonb,
  feature_flags = '{"progress_overview":true,"learning_history":true,"priority_analysis":false,"coach_access":false}'::jsonb,
  updated_at = timezone('utc', now())
where plan_key = 'starter';

update public.billing_plan_catalog
set
  note = 'Für strukturiertes Coaching mit persönlichen Trainingspfaden.',
  limits = '{"sessionsPerDay":1,"maxSessionLengthMinutes":15}'::jsonb,
  feature_flags = '{"progress_overview":true,"learning_history":true,"priority_analysis":true,"coach_access":true}'::jsonb,
  updated_at = timezone('utc', now())
where plan_key = 'pro';

commit;
