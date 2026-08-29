# Supabase-Datenbankstruktur: Benutzerprofile & Rollen

## Zielbild
- **Auth-Basis:** `auth.users` (Supabase Auth)
- **App-Daten:** `public.profiles` (erweiterte Nutzerdaten)
- **Trennung:** sensible Auth-Daten bleiben in `auth.users`, App-Metadaten in `public.profiles`
- **Rollen:** `user` und `admin` via Enum `public.user_role`

## Tabellen

### `auth.users`
Wird von Supabase Auth verwaltet und enthält die Identität (E-Mail, Passwort-Hash etc.).

### `public.profiles`
1:1-Erweiterung zu `auth.users` über dieselbe `id`.

| Feld | Typ | Pflicht | Default | Beschreibung |
|---|---|---:|---|---|
| `id` | `uuid` | ja | – | FK auf `auth.users.id` (`on delete cascade`) |
| `role` | `public.user_role` | ja | `'user'` | Anwendungsrolle (`user` / `admin`) |
| `display_name` | `text` | nein | `null` | Anzeigename |
| `native_language` | `text` | nein | `null` | Muttersprache |
| `german_level` | `text` | nein | `null` | CEFR-Level (`A1`–`C2`) |
| `onboarding_completed` | `boolean` | ja | `false` | Onboarding-Status |
| `created_at` | `timestamptz` | ja | `now()` UTC | Erstellungszeit |
| `updated_at` | `timestamptz` | ja | `now()` UTC | Änderungszeit |

## Automatische Profilerstellung
- Trigger auf `auth.users` (`after insert`)
- Funktion `public.handle_new_auth_user()` legt automatisch `public.profiles` an.

## RLS & Policies
RLS ist aktiv und erzwungen (`enable row level security` + `force row level security`).

- **Select:** User sieht eigenes Profil; Admin sieht alle.
- **Update:** User ändert eigenes Profil; Admin ändert alle.
- **Insert:** User darf eigenes Profil anlegen (Fallback, wenn Trigger nicht griff).
- **Delete:** Nur Admin.

Admin-Erkennung erfolgt über `public.is_admin()` (Security Definer).

## Manuelle Umsetzung in Supabase
Da keine direkte DB-Verbindung besteht, bitte im Supabase-Projekt ausführen:

1. Supabase Dashboard öffnen
2. **SQL Editor** → **New query**
3. Inhalt von `supabase/migrations/20260422090000_create_profiles_and_roles.sql` einfügen
4. Query ausführen
5. Optional prüfen:
   - `select * from public.profiles limit 5;`
   - Test-User registrieren und prüfen, ob Profil automatisch erstellt wurde
6. Für einen Admin-User Rolle setzen:
   - `update public.profiles set role = 'admin' where id = '<USER_UUID>';`

## Hinweis zur Rollenvergabe
Setze `admin` nur serverseitig bzw. über sicheren Admin-Workflow, nicht direkt im offenen Client-Flow.
Admin-Autorisierung in der App erfolgt ausschließlich über `public.profiles.role`; `auth.users`-Metadaten sind dafür nicht maßgeblich.
