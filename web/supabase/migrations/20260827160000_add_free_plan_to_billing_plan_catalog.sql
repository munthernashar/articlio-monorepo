begin;

-- Pricing-Umstellung Phase 1a (27.08.2026): dritte Preisstufe "Free" -- kehrt die frühere
-- explizite Entscheidung "kein dauerhaftes Free-Tier" (siehe process-session/index.ts) bewusst
-- um, auf Munthers ausdrücklichen Wunsch nach einer Drei-Pakete-Struktur (Free/Starter/Pro).
-- Free ist bewusst eng begrenzt (1 Session/Tag, 5 Minuten) -- lang genug, dass eine Session
-- nicht routinemäßig als "insufficient_data" durchfällt, kurz genug für einen echten
-- Upgrade-Anreiz. Neues Flag lernpfade_access trennt das Lernpfade-Feature (ab Starter) vom
-- Coach (weiterhin nur Pro, siehe bestehendes coach_access-Flag) -- beide Features sind
-- unabhängig voneinander gate-bar.
insert into public.billing_plan_catalog (
  plan_key, display_name, price_label, price_amount_cents, note, feature_flags, limits, sort_order, is_active
) values (
  'free',
  'Free',
  'Kostenlos',
  0,
  'Kostenlos ausprobieren, ohne Kreditkarte.',
  '{"progress_overview": true, "learning_history": true, "priority_analysis": false, "coach_access": false, "lernpfade_access": false}'::jsonb,
  '{"sessionsPerDay":1,"maxSessionLengthMinutes":5}'::jsonb,
  5,
  true
);

update public.billing_plan_catalog
set feature_flags = feature_flags || '{"lernpfade_access": true}'::jsonb
where plan_key in ('starter', 'pro');

commit;
