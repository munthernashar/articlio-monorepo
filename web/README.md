# Articlio

Produktionsnahes Grundgerüst für einen **AI-gestützten Deutsch-Konversationscoach** (React + Vite + TypeScript).

## Stack
- Frontend: React, Vite, TypeScript
- Routing: React Router
- Backend/Auth/DB: Supabase (Client vorbereitet)
- AI-Orchestrierung: dedizierte Service-Schicht
- Deployment: Vercel (`vercel.json` für SPA-Rewrites)

## Architektur
```txt
src/
  app/
    layout/          # Globales App-Chrome
    routes/          # Routing + Pfadkonstanten
  components/
    ui/              # Wiederverwendbare Präsentations-Komponenten
  features/
    admin/           # Admin-spezifische UI-Bausteine
    auth/            # Auth-Feature (Gates/Flows)
    progress/        # Lernfortschritts-Feature
    sessions/        # Session-History/Details
    tutor/           # Konversations-Tutor-Feature
    user/            # User-Management / Profil
  pages/
    admin/
    auth/
    sessions/
  services/
    api/             # Zentrale API-Contracts + Gateway-Layer
    ai/              # Prompting/Orchestrierung
    supabase/        # Supabase Client + Auth-Service
  lib/
    config.ts        # Zentrale Konfigurationsschicht
    env.ts           # Typisierte Env-Layer
  types/
    domain.ts        # Domänentypen
  styles/
    global.css
```

## Lokale Entwicklung
1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Umgebungsvariablen setzen:
   ```bash
   cp .env.example .env
   ```
3. Dev-Server starten:
   ```bash
   npm run dev
   ```

## Stripe + Supabase Functions Setup

### 1) Stripe CLI installieren und einloggen
1. Stripe CLI installieren: <https://docs.stripe.com/stripe-cli>
2. Login ausführen:
   ```bash
   stripe login
   ```

### 2) Lokalen Webhook-Forwarding-Listener starten
```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

### 3) Supabase Secrets für Functions setzen
Alle benötigten Secrets für Stripe + Base URL in einem Schritt setzen:
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... \
  STRIPE_PRICE_STARTER=... \
  STRIPE_PRICE_PRO=... \
  APP_BASE_URL=...
```

### 4) Functions deployen
```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

Optional:
```bash
supabase functions deploy create-billing-portal-session
```

### 5) Stripe Dashboard konfigurieren (Pflicht)
- **Prices** für Starter/Pro anlegen und die `price_...` IDs in `STRIPE_PRICE_STARTER` und `STRIPE_PRICE_PRO` eintragen.
- **Webhook Endpoint** für die Zielumgebung konfigurieren (lokal via Stripe CLI, in Produktion mit öffentlicher URL).
- Im Endpoint die benötigten **Events** aktivieren (mindestens die von `stripe-webhook` verarbeiteten Subscription-/Checkout-Events).

## Supabase: Was genau konfigurieren?

### 1) Projekt erstellen
- In Supabase ein neues Projekt anlegen.
- Region passend zu deinen Usern wählen (z. B. EU-West).

### 2) API-Werte holen
Supabase Dashboard → **Settings → API**:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` key → `VITE_SUPABASE_ANON_KEY`

> **Wichtig:** Niemals den `service_role` key im Frontend/Vite-Env verwenden.
> `service_role` ist ausschließlich für serverseitige Laufzeiten erlaubt (Edge Functions, Backend-API, Cron/Worker).

### 3) Auth URL-Konfiguration
Supabase Dashboard → **Authentication → URL Configuration**:
- `Site URL`:
  - lokal: `http://localhost:5173`
  - prod: deine Vercel-Domain (z. B. `https://articlio.vercel.app`)
- `Redirect URLs`:
  - `http://localhost:5173/*`
  - `https://<deine-domain>/*`
  - optional Preview-Deploys: `https://*.vercel.app/*`

### 4) Auth Provider aktivieren
Supabase Dashboard → **Authentication → Providers**:
- mindestens `Email` aktivieren (für Login/Register-Flow im Scaffold)
- optional später OAuth (Google etc.) ergänzen

### 5) (Optional) Erste Datenbankstrukturen
Für den Start sind typischerweise sinnvoll:
- `profiles`
- `conversation_sessions`
- `conversation_messages`
- RLS-Policies pro User (`auth.uid()`)

## Welche ENV in Vercel?

### Für dieses Frontend-Scaffold (Minimum)
Diese Variablen in Vercel unter **Project → Settings → Environment Variables** eintragen:
- `VITE_APP_ENV=production`
- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`
- `VITE_OPENAI_API_BASE_URL=https://api.openai.com/v1`
- `VITE_OPENAI_API_KEY=` *(nur falls bewusst im Browser getestet; in Produktion vermeiden)*

### Empfehlung für Produktion
- OpenAI nicht direkt aus dem Browser aufrufen.
- Stattdessen API-Route/Backend nutzen und dort `OPENAI_API_KEY` (ohne `VITE_`) als **Server-Secret** in Vercel setzen.



## Stripe Billing Edge Functions

Für `create-checkout-session` und `create-billing-portal-session` werden folgende Supabase Secrets benötigt:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`

Secrets setzen (Beispiel):

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_STARTER=price_... \
  STRIPE_PRICE_PRO=price_... \
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  APP_BASE_URL=https://your-app-domain.tld
```

Deploy der Billing Functions:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal-session
```

### Migration-Hinweis (Billing Portal)
- Standard-Endpoint ist jetzt ausschließlich `create-billing-portal-session`.
- Der frühere Endpoint `create-customer-portal-session` ist deaktiviert und liefert `410 FUNCTION_DEPRECATED`.
- Portal-Aufrufe sollen den Request `{ returnUrl, flowType? }` und als Response-Contract `{ url }` verwenden.

### Migration-Hinweis (Plan-Katalog / Pricing-Quelle)
- Preistext und Plan-Limits werden zentral in `public.billing_plan_catalog` gepflegt (Migration: `20260428113000_create_billing_plan_catalog.sql`).
- Änderungen an Stripe-Prices (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`) müssen immer zusammen mit den `price_label`/`limits`-Feldern im Plan-Katalog erfolgen.
- Empfohlener Ablauf für Admin/Seed: Stripe-Preis im Dashboard aktualisieren → `billing_plan_catalog` per SQL upsert anpassen → danach Billing/Pricing-UI prüfen.


## Prompt-Registry Priorität (Runtime)
- **Primär**: Laufzeit-Prompts werden aus `public.prompt_definitions` über den DB-Adapter geladen (`is_active = true` je `prompt_key`).
- **Fallback**: Hardcoded Seed-Registry unter `src/services/ai/prompt-registry.ts` dient nur als Bootstrap/Fallback (z. B. wenn kein aktiver DB-Eintrag verfügbar ist).
- **Mapping**: Bestehende `promptId`-Aufrufe (z. B. `session_transcript_cleanup_v1`) werden eindeutig auf `prompt_key` + `version` abgebildet. Damit können Admins über aktive DB-Versionen die Runtime steuern, ohne Aufrufer im Code umzubauen.

## Zentrale API-Konventionen
- Geschäftskritische Integrationen (insb. OpenAI-nahe Pfade) laufen über die zentrale API-Schicht `src/services/api/*`.
- Einheitlicher Response-Contract:
  - Erfolg: `data`, `meta`
  - Fehler: `error.code`, `error.message`, `traceId`
- Statuscode-/Retry-Mapping ist dokumentiert in: [`docs/api-conventions.md`](docs/api-conventions.md).
- Migration: OpenAI-nahe Aufrufe in der Prompt-Ausführung laufen über `openAiApiService` (statt direktem `fetch` in fachlichen Services).

## Wichtige Hinweise
- `VITE_OPENAI_API_KEY` ist nur als Entwicklungs-Placeholder vorgesehen.
- In Produktion sollte OpenAI **niemals direkt aus dem Browser** angesprochen werden, sondern via Backend/Edge-Proxy mit Guardrails.
