# API-Konventionen (zentral)

Alle geschäftskritischen API-Operationen laufen ausschließlich über `src/services/api/*`.

> Verbindliche OpenAI-Richtlinie für neue KI-Features: `docs/openai-integration-spec.md`

## Ziel
- Ein einziger Contract für erfolgreiche und fehlerhafte Antworten.
- Einheitliche Retry-Hinweise für aufrufende Services.
- Konsistente `traceId`-Weitergabe für Debugging/Audit.
- Keine direkten Upstream-`fetch`-Aufrufe in fachlichen Services (`src/services/ai/*`, `src/services/supabase/*`).

## Zentrale Schicht
- Public API-Layer: `src/services/api/index.ts`
- Contract-Typen + Factory-Funktionen: `src/services/api/contracts.ts`
- OpenAI-Gateway: `src/services/api/openai-api.service.ts`

> Konvention: Fachliche Services importieren OpenAI-Zugriffe nur aus `@/services/api`.

## Erfolgsantwort

```ts
{
  data: TData,
  meta: {
    traceId: string,
    timestamp: string, // ISO-8601
    status: number,
    retry?: {
      recommended: boolean,
      maxAttempts?: number,
      baseDelayMs?: number,
      retryAfterMs?: number,
    }
  }
}
```

### Konvention
- `data`: Fachlicher Payload.
- `meta.traceId`: Eindeutige Korrelations-ID für Logs und Downstream-Aufrufe.
- `meta.status`: Technischer HTTP-Status.
- `meta.retry`: Optionaler Hinweis, falls das erfolgreiche Ergebnis nur mit Retry-Strategie erreicht wurde.

## Fehlerantwort

```ts
{
  error: {
    code: string,
    message: string,
  },
  traceId: string,
  status: number,
  retry: {
    recommended: boolean,
    maxAttempts?: number,
    baseDelayMs?: number,
    retryAfterMs?: number,
  }
}
```

### Konvention
- `error.code`: Maschinenlesbarer Fehlercode (z. B. `rate_limited`, `unauthorized`, `upstream_error`).
- `error.message`: Human-readable Kontext inkl. Upstream-Details.
- `traceId`: Muss in allen Fehlerfällen gesetzt werden.
- `retry`: expliziter Hinweis für Aufrufer (Retry ja/nein + Parameter).

## Statuscodes & Retry-Hinweise (OpenAI-nahe Pfade)

| HTTP-Status | code | Retry |
|---|---|---|
| 400/422 | `invalid_request` | nein |
| 401 | `unauthorized` | nein |
| 403 | `forbidden` | nein |
| 404 | `not_found` | nein |
| 408 | `upstream_timeout` | ja (`maxAttempts=3`, `baseDelayMs=300`) |
| 429 | `rate_limited` | ja (`maxAttempts=5`, `baseDelayMs=1000`, optional `retryAfterMs`) |
| 502/503/504 | `upstream_unavailable` | ja (`maxAttempts=4`, `baseDelayMs=600`) |
| >=500 | `upstream_error` | ja (`maxAttempts=3`, `baseDelayMs=500`) |
| Netzwerkfehler | `network_error` | ja (`maxAttempts=3`, `baseDelayMs=500`) |
| JSON-Parsingfehler | `parse_error` | nein |

## Domain-Guard: Tageslimit Gesprächssekunden

- Guard-Ort: `sessionService.createConversationSession` und `sessionService.updateConversationSessionAfterUpload`.
- Fehlercode für API-Antworten: `daily_conversation_seconds_limit_exceeded`.
- Message-Schema (`error.message`): UX-tauglich mit konkretem Limit und User-Zeitzone, z. B.  
  `Tageslimit für Gesprächszeit erreicht: maximal <seconds> Sekunden (<minutes> Minuten) pro Tag (<timezone>) erlaubt.`

## Migration-Status
- Prompt-Ausführung (`PromptExecutionService`) nutzt das zentrale OpenAI-Gateway (`openAiApiService`) via `@/services/api`.
- Direkte OpenAI-`fetch`-Aufrufe verbleiben nur innerhalb von `src/services/api/openai-api.service.ts`.
