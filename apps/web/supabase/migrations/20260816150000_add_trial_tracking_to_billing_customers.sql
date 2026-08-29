-- Betreiber-Entscheidung (16.08.2026): 14 Tage kostenfreie Testphase auf den bei
-- der Registrierung/Checkout gewählten Plan, danach automatische Abbuchung
-- über Stripe (trial_period_days). trial_started_at trackt, ob ein Nutzer die
-- Testphase bereits einmal in Anspruch genommen hat -- verhindert, dass ein
-- Nutzer durch Kündigen+Neuanmelden wiederholt kostenfrei testet.
--
-- Wird gesetzt in supabase/functions/stripe-webhook/index.ts, sobald ein
-- checkout.session.completed/subscription-Event mit status='trialing'
-- verarbeitet wird -- nicht schon beim Erstellen der Checkout-Session, damit
-- ein abgebrochener Checkout die Testphasen-Berechtigung nicht verbraucht.

alter table public.billing_customers
  add column if not exists trial_started_at timestamptz null;

comment on column public.billing_customers.trial_started_at is
  'Zeitpunkt, an dem dieser Nutzer erstmals eine 14-Tage-Testphase gestartet hat (gesetzt vom stripe-webhook bei status=trialing). NULL = noch nicht verbraucht, Checkout darf trial_period_days anhängen.';
