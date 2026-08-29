# Funnel Event Taxonomy (MVP)

Dieses minimale Eventset misst den Signup- und Checkout-Funnel ohne sensible Nutzerdaten.

## Grundregeln

- **Keine sensitiven Felder** in Payloads: keine Passwörter, keine vollständigen E-Mails, keine Freitextinhalte.
- Payloads enthalten nur Funnel-Kontext (z. B. Oberfläche, Plan-Key, Status-Flags).
- Versand erfolgt über den zentralen Adapter `src/services/analytics/funnel-tracking.ts`.

## Events

| Event | Wann wird getrackt? | Eventfelder |
|---|---|---|
| `pricing_viewed` | Bei Aufruf einer Pricing-Seite | `surface` (`public_pricing` \| `billing_pricing`), `planCount?` (nur public pricing) |
| `signup_started` | Beim Start der Registrierung (Klick auf Plan-CTA oder Submit im Register-Formular) | `source` (`public_pricing` \| `register_page`), `planName?` |
| `signup_completed` | Nach erfolgreichem Signup | `verificationRequired` (`boolean`) |
| `checkout_started` | Beim Start des Stripe-Checkouts | `planKey`, `currentPlanKey?` |
| `checkout_completed` | Nach Rückkehr mit `?checkout=success` | `surface` (`billing_pricing`) |
