# OpenAI Proxy – lokale Einrichtung

Diese App ruft OpenAI **nicht direkt im Frontend** auf. Stattdessen wird die Supabase Edge Function `openai-chat-proxy` genutzt.

## Verbindliche Integrationsrichtlinie

Für neue KI-Features gilt zusätzlich die zentrale Spezifikation:

- `docs/openai-integration-spec.md`

## 1) Frontend-Umgebungsvariablen

In `.env` (siehe `.env.example`) werden nur nicht-sensitive Werte gesetzt:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OPENAI_PROXY_PATH` (optional, default: `/functions/v1/openai-chat-proxy`)

## 2) Server-Secrets für die Edge Function

Setze die Secrets für Supabase Functions lokal und in der Zielumgebung:

```bash
supabase secrets set OPENAI_API_KEY=sk-... OPENAI_BASE_URL=https://api.openai.com/v1
```

- `OPENAI_API_KEY` (**erforderlich**): geheimer OpenAI Key, nur serverseitig.
- `OPENAI_BASE_URL` (optional): Standard ist `https://api.openai.com/v1`.

## 3) Function lokal starten

```bash
supabase functions serve openai-chat-proxy --no-verify-jwt
```

Danach ist die Route unter `http://127.0.0.1:54321/functions/v1/openai-chat-proxy` erreichbar.

## 4) Fehler-Mapping

Die Function mappt wichtige Upstream-Fehler für besseres Frontend-Handling:

- `401` → `unauthorized` (API-Key fehlt/falsch)
- `429` → `rate_limited` (Rate Limit erreicht)
- `5xx` → `upstream_error` (OpenAI temporär nicht verfügbar)


## 5) STT Function `transcribe-session-audio`

Für Audio-Transkription aus Supabase Storage gibt es die Edge Function `transcribe-session-audio`.

Secrets (zusätzlich/gleich wie oben):

```bash
supabase secrets set OPENAI_API_KEY=sk-... OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_STT_MODEL=gpt-4o-mini-transcribe STT_PROVIDER=openai
```

Lokal starten/deployen:

```bash
supabase functions serve transcribe-session-audio --no-verify-jwt
supabase functions deploy transcribe-session-audio
```
