# `transcribe-session-audio` (Supabase Edge Function)

POST-Endpoint zur serverseitigen Transkription von Session-Audio aus Supabase Storage.

## Request

- Methode: `POST`
- Route: `/functions/v1/transcribe-session-audio`
- Header:
  - `Authorization: Bearer <supabase-jwt>`
  - `Content-Type: application/json`

Body:

```json
{
  "userId": "<uuid>",
  "sessionId": "<uuid-or-id>",
  "audioBucket": "session-audio",
  "audioFilePath": "user-123/session-abc.webm",
  "expectedLanguage": "de"
}
```

## Response (200)

```json
{
  "success": true,
  "data": {
    "rawTranscript": "...",
    "languageCode": "de",
    "segments": []
  },
  "traceId": "..."
}
```

## Response (Fehler)

```json
{
  "success": false,
  "error": {
    "code": "storage_file_not_found",
    "message": "Audio file not found in storage",
    "details": {}
  },
  "traceId": "..."
}
```

## Fehlercodes

- `missing_audio_path` → `400`
- `missing_session_id` → `400`
- `missing_user_id` → `400`
- `storage_file_not_found` → `404`
- `storage_download_failed` → `502`
- `invalid_audio_format` → `400`
- `stt_provider_error` → `502`
- `missing_stt_api_key` → `500`
- `unauthorized` → `401` / `403`
- `unknown_error` → `500`

## Benötigte Secrets / Env (Edge Function)

Pflicht:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

Empfohlen/optional:

```bash
supabase secrets set OPENAI_BASE_URL=https://api.openai.com/v1
supabase secrets set OPENAI_STT_MODEL=gpt-4o-mini-transcribe
supabase secrets set STT_PROVIDER=openai
```

Von Supabase lokal/remote bereitgestellt (nicht manuell hartcodieren):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Lokal testen / deployen

```bash
supabase functions serve transcribe-session-audio --no-verify-jwt
supabase functions deploy transcribe-session-audio
```

Wenn JWT-Prüfung erzwungen werden soll, `--no-verify-jwt` beim lokalen Serve weglassen und mit echtem Bearer-Token testen.
