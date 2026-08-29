begin;

-- Die Seed-Migration 20260428113000 hat 19 €/49 € eingetragen. In Produktion
-- wurden die Preise seither außerhalb der Migrationshistorie auf 5 €/9 €
-- geändert (bestätigt vom Betreiber am 15.08.2026), sodass eine frische
-- Umgebung bislang andere Preise geseedet hätte als produktiv aktiv sind.
-- Diese Migration bringt den versionierten Seed-Stand auf den echten Stand.
update public.billing_plan_catalog
set
  price_label = '5 € / Monat',
  updated_at = timezone('utc', now())
where plan_key = 'starter';

update public.billing_plan_catalog
set
  price_label = '9 € / Monat',
  updated_at = timezone('utc', now())
where plan_key = 'pro';

commit;
