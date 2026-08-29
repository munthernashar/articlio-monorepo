# Lokale Entwicklung mit pnpm + Turbo

## Wichtig für Vercel Deployment

Vercel verwendet **npm** (nicht pnpm), weil:
- `turbo.json` wurde gelöscht (Vercel erkennt es sonst und erzwingt pnpm)
- `pnpm-workspace.yaml` ist leer (Vercel ignoriert es)

## Für lokale Entwicklung mit pnpm + Turbo

Wenn du lokal mit pnpm und Turbo arbeiten willst:

### 1. turbo.json wiederherstellen

Erstelle `turbo.json` im Root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["SUPABASE_URL", "SUPABASE_ANON_KEY"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 2. pnpm-workspace.yaml wiederherstellen

Erstelle `pnpm-workspace.yaml` im Root:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3. Lokale Entwicklung

```bash
# Dependencies installieren
pnpm install

# Alle Apps starten (Web + Mobile)
pnpm dev

# Nur Web-App
pnpm dev:web

# Nur Mobile-App
cd apps/mobile
pnpm dev
```

## Vercel Deployment

Vercel ignoriert diese Dateien und verwendet **npm**:

```bash
# Vercel Build (automatisch)
cd apps/web
npm install
npm run build
```

## Zusammenfassung

| Umgebung | Package Manager | Build Tool |
|----------|----------------|------------|
| **Vercel** | npm | Vite |
| **Lokal** | pnpm | Turbo + Vite |

**Wichtig:** Stelle sicher, dass `turbo.json` und `pnpm-workspace.yaml` im `.gitignore` sind, wenn du sie nur lokal verwenden willst!
