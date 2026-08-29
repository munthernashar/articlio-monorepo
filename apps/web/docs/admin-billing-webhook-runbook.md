# Admin Runbook: Fehlgeschlagene Stripe-Webhooks

Ziel: Support kann fehlgeschlagene Billing-Events schnell bewerten und die nächsten Schritte standardisiert ausführen.

## Wo schauen?

- Admin-UI: `Admin Billing Events` (`/admin/billing-events`)
- Sicht ist bereits gefiltert auf `processing_status = failed` und nach `updated_at DESC` sortiert.
- Relevante Felder pro Event:
  - `event_type`
  - `stripe_event_id`
  - `user_id`
  - `processing_error`
  - `updated_at`

## Minimaler Support-Workflow

### 1) triage

- Prüfen, ob `processing_error` ein temporäres Problem (z. B. Timeout/Rate Limit) oder ein Datenproblem (fehlende IDs, ungültiger Status) zeigt.
- Prüfen, ob mehrere Events mit gleichem `stripe_event_id`/gleichem User betroffen sind.
- Ticket anlegen/aktualisieren mit: `stripe_event_id`, `event_type`, `user_id`, Fehlertext, Zeitstempel `updated_at`.

### 2) replay

- Bei temporären Fehlern: webhook intern erneut verarbeiten (über bestehendes Ops-Verfahren für Replay).
- Nach Replay prüfen, ob Event aus der `failed`-Liste verschwindet bzw. `processing_status` auf `processed` wechselt.
- Ticket mit Replay-Zeitpunkt und Ergebnis dokumentieren.

### 3) escalate

- Wenn Replay fehlschlägt oder Dateninkonsistenz vorliegt: an Engineering eskalieren.
- Pflichtinfos in Eskalation:
  - `stripe_event_id`
  - `event_type`
  - `user_id`
  - vollständiger `processing_error`
  - letzter Zeitpunkt (`updated_at`)
  - bereits durchgeführte Replay-Versuche
