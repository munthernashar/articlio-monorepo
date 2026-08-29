begin;

-- Munthers Feature-Anfrage 26.08.2026: Marge je Nutzer im Admin-Bereich
-- (Abo-Preis minus generierte KI-Kosten). billing_plan_catalog.price_label
-- ist bisher nur ein Anzeigetext ("9 € / Monat") -- fuer eine Margenrechnung
-- wird ein echter numerischer Wert benoetigt. Diese Spalte ist bewusst NICHT
-- an die kundenseitige Preis-Pipeline (plan-catalog.service.ts,
-- BillingPlanContract, Pricing-Seiten) angebunden -- sie wird ausschliesslich
-- von der neuen admin-internen Kosten/Marge-Auswertung gelesen. Bei
-- Preisaenderungen muss diese Spalte zusammen mit price_label gepflegt werden.
alter table public.billing_plan_catalog
  add column if not exists price_amount_cents integer;

alter table public.billing_plan_catalog
  add constraint billing_plan_catalog_price_amount_cents_non_negative
  check (price_amount_cents is null or price_amount_cents >= 0);

comment on column public.billing_plan_catalog.price_amount_cents is
  'Numerisches Pendant zu price_label (in Cent), nur fuer interne Admin-Margenauswertung. Nicht kundenseitig angebunden.';

update public.billing_plan_catalog set price_amount_cents = 500 where plan_key = 'starter';
update public.billing_plan_catalog set price_amount_cents = 900 where plan_key = 'pro';

commit;
