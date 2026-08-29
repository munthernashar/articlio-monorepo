import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FALLBACK_PLAN_CONTRACTS } from '@/services/billing/plan-fallback-catalog';

describe('billing plan catalog consistency', () => {
  it('keeps fallback catalog values aligned with seeded SQL catalog', () => {
    // Struktur (plan_key, Limits) kommt weiterhin aus dem ursprünglichen Seed.
    const seedMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260428113000_create_billing_plan_catalog.sql'),
      'utf8',
    );

    // Der Seed-Preis (19 €/49 €) wurde in Produktion außerhalb der Migrationshistorie auf
    // 5 €/9 € geändert; diese Migration bringt den versionierten Stand nachträglich auf den
    // echten Stand. Der aktuell gültige price_label steht deshalb hier, nicht im Seed.
    const priceSyncMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260815120000_sync_billing_plan_catalog_live_prices.sql'),
      'utf8',
    );

    // Wirtschaftlichkeitsprüfung 21.08.2026: sessionsPerDay/maxSessionLengthMinutes wurden
    // ebenso außerhalb des Seeds auf den echten Stand gebracht (1 Session/Tag, 15 Minuten
    // für beide Pläne). Analog zur Preis-Sync-Migration hier prüfen statt gegen den
    // unveränderten Seed, dessen alte Werte (3/12 Sessions) sonst nur zufällig als
    // Teilstring von "12" durchgehen würden.
    const limitsSyncMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260821100000_sync_billing_plan_catalog_live_limits.sql'),
      'utf8',
    );

    // Pricing-Umstellung Phase 1/3 (27.08.2026): das Free-Tier existiert nicht im
    // ursprünglichen Seed, sondern wurde per eigener Migration nachträglich hinzugefügt --
    // dieselbe Situation wie Preis-/Limits-Sync für starter/pro oben, nur für einen neuen
    // plan_key statt geänderte Werte eines bestehenden. Free-Werte werden deshalb zusätzlich
    // gegen diese Migration geprüft, nicht nur gegen den ursprünglichen Seed.
    const freeSyncMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260827160000_add_free_plan_to_billing_plan_catalog.sql'),
      'utf8',
    );

    // Korrektur (27.08.2026, zwei Runden): Free wurde von 5 auf 2 und dann auf 3 Minuten
    // Session-Länge korrigiert, bevor überhaupt ein echter Free-Nutzer existierte -- die
    // ursprüngliche Free-Sync-Migration oben behält deshalb bewusst den (inzwischen
    // überholten) 5-Minuten-Wert in ihrer Historie, die Limits-Prüfung greift stattdessen
    // zusätzlich auf die aktuell gültige Korrektur-Migration zurück.
    const freeCorrectionMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260827190000_correct_free_plan_session_length_to_3_minutes.sql'),
      'utf8',
    );

    for (const plan of FALLBACK_PLAN_CONTRACTS) {
      expect(
        seedMigration.includes(`'${plan.planKey}'`) || freeSyncMigration.includes(`'${plan.planKey}'`),
        `plan_key '${plan.planKey}' fehlt sowohl im ursprünglichen Seed als auch in der Free-Sync-Migration.`,
      ).toBe(true);
      expect(
        priceSyncMigration.includes(`'${plan.priceLabel}'`) || freeSyncMigration.includes(`'${plan.priceLabel}'`),
        `priceLabel '${plan.priceLabel}' für Plan '${plan.planKey}' fehlt sowohl in der Preis-Sync- als auch in der Free-Sync-Migration.`,
      ).toBe(true);

      const sessions = plan.limits.sessionsPerDay;
      const minutes = plan.limits.maxSessionLengthMinutes;
      const limitsSubstring = `"sessionsPerDay":${sessions},"maxSessionLengthMinutes":${minutes}`;
      expect(
        limitsSyncMigration.includes(limitsSubstring) ||
          freeSyncMigration.includes(limitsSubstring) ||
          freeCorrectionMigration.includes(limitsSubstring),
        `Limits (${limitsSubstring}) für Plan '${plan.planKey}' fehlen sowohl in der Limits-Sync- als auch in der Free-Sync-/Korrektur-Migration.`,
      ).toBe(true);
    }
  });

  // Launch-Readiness-Audit, Befund C / Welle 2 #12: die obige Prüfung stellt nur sicher,
  // dass zwei rein informative Marketing-/UI-Textquellen (Fallback-Katalog und DB-Seed)
  // untereinander konsistent sind. Sie berührt nie den tatsächlichen Durchsetzungspfad --
  // `stripe-webhook/index.ts` setzt bei jedem Subscription-Event über
  // `sync_user_entitlements_from_billing` die real geltenden `user_entitlements`-Limits,
  // die wiederum `process-session` serverseitig durchsetzt (siehe
  // `enforceSessionsPerDayGuard`/`enforceSessionLengthGuard`). Genau dieses Auseinanderlaufen
  // von Versprechen und Durchsetzung war die Ursache von Befund C (Pro-Plan versprach 60
  // Minuten, der Recorder brach serverfern bei 15 Minuten ab). Diese Prüfung schließt die
  // Lücke, indem sie das Marketing-Limit direkt gegen den PLAN_CONFIGS-Block im Webhook
  // validiert, der `user_entitlements` tatsächlich befüllt.
  it('hält Marketing-Limits (FALLBACK_PLAN_CONTRACTS) deckungsgleich mit den real durchgesetzten Entitlement-Limits im Stripe-Webhook', () => {
    const stripeWebhookSource = readFileSync(
      resolve(process.cwd(), 'supabase/functions/stripe-webhook/index.ts'),
      'utf8',
    );

    for (const plan of FALLBACK_PLAN_CONTRACTS) {
      const planConfigBlockMatch = stripeWebhookSource.match(
        new RegExp(`planKey:\\s*'${plan.planKey}'[\\s\\S]*?\\}`),
      );
      expect(
        planConfigBlockMatch,
        `PLAN_CONFIGS in stripe-webhook/index.ts enthält keinen Eintrag für planKey '${plan.planKey}'.`,
      ).not.toBeNull();
      const planConfigBlock = planConfigBlockMatch![0];

      const promisedSessionsPerDay = plan.limits.sessionsPerDay;
      const promisedMaxSessionLengthMinutes = plan.limits.maxSessionLengthMinutes;
      expect(
        promisedSessionsPerDay,
        `Plan '${plan.planKey}': FALLBACK_PLAN_CONTRACTS.limits.sessionsPerDay fehlt.`,
      ).toBeTypeOf('number');
      expect(
        promisedMaxSessionLengthMinutes,
        `Plan '${plan.planKey}': FALLBACK_PLAN_CONTRACTS.limits.maxSessionLengthMinutes fehlt.`,
      ).toBeTypeOf('number');
      const promisedMaxSessionLengthSeconds = promisedMaxSessionLengthMinutes! * 60;

      expect(
        planConfigBlock,
        `Plan '${plan.planKey}': Marketing verspricht sessionsPerDay=${promisedSessionsPerDay}, ` +
          `stripe-webhook setzt aber ein anderes sessionsPerDayLimit im tatsächlichen Entitlement.`,
      ).toContain(`sessionsPerDayLimit: ${promisedSessionsPerDay}`);

      expect(
        planConfigBlock,
        `Plan '${plan.planKey}': Marketing verspricht maxSessionLengthMinutes=${promisedMaxSessionLengthMinutes} ` +
          `(${promisedMaxSessionLengthSeconds}s), stripe-webhook setzt aber ein anderes ` +
          `maxSessionLengthSeconds im tatsächlichen Entitlement.`,
      ).toContain(`maxSessionLengthSeconds: ${promisedMaxSessionLengthSeconds}`);
    }
  });
});
