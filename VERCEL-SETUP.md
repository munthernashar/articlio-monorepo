# Vercel Deployment Setup

## WICHTIG: Neues Vercel-Projekt erstellen!

### Schritt 1: Altes Vercel-Projekt löschen

1. Gehe zu: https://vercel.com/munthernashars-projects/articlio-monorepo/settings
2. **Danger Zone** > **Delete Project**

### Schritt 2: Neues Vercel-Projekt erstellen

1. Gehe zu: https://vercel.com/new
2. **Import Git Repository**
3. W ähle: `munthernashar/articlio-monorepo`
4. **Configure Project**:
   - **Name:** `articlio-web` (oder was du willst)
   - **Framework Preset:** Vite
   - **Root Directory:** `apps/web` ⚠️ **WICHTIG!**
   - **Build Command:** `npm install && npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### Schritt 3: Environment Variables

F üge hinzu:
- `VITE_SUPABASE_URL` = `https://dein-project.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `dein-anon-key`

### Schritt 4: Deploy

Klicke **Deploy**

---

## Warum Root Directory = `apps/web`?

Vercel erkennt automatisch:
- `pnpm-workspace.yaml` → verwendet pnpm (hat Registry-Probleme)
- `turbo.json` → verwendet pnpm + Turbo

Wenn du **Root Directory auf `apps/web`** setzt, sieht Vercel nur:
- `package.json` (mit npm)
- `package-lock.json` (npm)
- `.npmrc` (npm Konfiguration)

Und **kein pnpm**!

---

## Lokale Entwicklung

Lokal kannst du weiterhin pnpm + Turbo verwenden:

```bash
pnpm install
pnpm dev
```

Vercel verwendet aber npm, weil es nur `apps/web` sieht.
