# Supabase Security & RLS Hardening (April 22, 2026)

## Überblick
Dieses Hardening stellt sicher, dass sensible Lern- und KI-Daten strikt zwischen Benutzer- und Admin-Kontext getrennt sind:

- **RLS bleibt auf allen Kern-Tabellen aktiv + erzwungen** (`profiles`, Sessions, Transkripte, Analysen, Tutor, Prompts, App Settings).
- **Policy-Trennung wurde explizit gemacht** (eigene User-Policies vs. Admin-Policies).
- **Profile-Privilege-Escalation ist blockiert** (Benutzer können ihre Rolle nicht selbst auf `admin` ändern).
- **Storage für Audio ist privat** und auf den eigenen Ordner (`{auth.uid()}/...`) beschränkt.

## Implementierte Maßnahmen

### 1) Benutzer-/Admin-Trennung in `profiles`
- Neue Trigger-Logik verhindert:
  - Änderung der Profil-ID.
  - Rollenänderung (`role`) durch Nicht-Admins.
- `profiles`-Policies sind nun getrennt:
  - User: lesen/insert/update nur eigenes Profil.
  - Admin: lesen/update/delete alle Profile.

### 2) Schutz von Session-, Analyse-, Tutor- und Prompt-Daten
- Session/Analyse/Tutor-Daten waren bereits über `user_id = auth.uid()` abgesichert (RLS aktiv + force).
- Prompt-Tabellen wurden auf klare **Admin-only Governance** gehärtet:
  - `prompt_definitions`: select/insert/update/delete nur Admin.
  - `prompt_execution_logs`: select/insert/delete nur Admin.

### 3) Sichere Storage-Zugriffe für Audio-Dateien
- Bucket `session-audio` wird als **private** konfiguriert.
- Dateipfad-Pattern basiert auf User-Ordnern (`{user_id}/{session_id}/...`).
- RLS-Policies auf `storage.objects` erlauben:
  - User nur Zugriff auf eigenes Prefix (`foldername(name)[1] = auth.uid()`).
  - Admin Zugriff auf alle Objekte im Bucket.

## Service-Role: Nur serverseitig verwenden

**Strikte Regel:** `service_role` darf niemals im Frontend / Browser laufen.

Erlaubte Nutzung (Server only):
- Supabase Edge Functions.
- Eigene Backend-API (z. B. Vercel Serverless / Node backend).
- Batch-/Cron-Jobs für trusted Operations.

Nicht erlaubt:
- `VITE_*` Variablen.
- Browser-Clients.
- Mobile/Web Apps mit eingebettetem Secret.

## Security-Review: erkannte Risiken und Status
- **Risiko:** Selbst-Eskalation über `profiles.role` bei eigenem Update.
  - **Status:** Behoben via Trigger `enforce_profile_security`.
- **Risiko:** Unklare Policy-Grenzen in Prompt-Tabellen (nur Teiloperationen explizit).
  - **Status:** Behoben via vollständige Admin-Policies.
- **Risiko:** Audio-Storage ohne verlässliche Prefix-Isolation.
  - **Status:** Behoben via Bucket-Privatisierung + objektbezogene RLS-Policies.

## Empfohlene nächste Schritte
1. Optionales Audit-Logging für Admin-Änderungen (`profiles.role`, `prompt_definitions`, `app_settings`).
2. Optionaler DB-Role-Split für interne Worker (separat von vollprivilegierter Service Role).
3. Regelmäßige RLS-Regressionstests (z. B. SQL test matrix pro Rolle).

## Sicherheitsnotiz (GAP-002): Return-URL-Validierung in Billing-Portal-Flows
- Für Billing-Portal-Edge-Functions wird `returnUrl` jetzt konsistent per Allowlist validiert.
- Als erlaubte Origin gilt der Origin aus `APP_BASE_URL` sowie lokal `localhost` / `127.0.0.1`.
- `APP_BASE_URL` ist Pflicht; fehlt sie oder ist sie ungültig, liefern die betroffenen Functions einen klaren `500 SERVER_MISCONFIGURED`-Fehler mit Diagnose.
- Ungültige oder nicht erlaubte Return-Origins werden stabil mit `400 INVALID_RETURN_URL_ORIGIN` beantwortet.
