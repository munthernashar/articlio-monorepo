# Articlio Monorepo

Ein Monorepo für die Articlio-Plattform mit Web-App (Vite + React) und Mobile-App (Expo + React Native).

## 🏗️ Struktur

```
articlio-monorepo/
├── apps/
│   ├── web/              # Vite + React Web-App (Vercel)
│   └── mobile/           # Expo + React Native Mobile-App (EAS Build)
├── packages/
│   ├── types/            # TypeScript-Typen (shared)
│   ├── api/              # Supabase-Client & API-Calls (shared)
│   ├── utils/            # Helper-Funktionen (shared)
│   └── ui/               # UI-Komponenten (shared)
├── turbo.json            # Turborepo-Konfiguration
├── pnpm-workspace.yaml   # pnpm Workspaces
├── vercel.json           # Vercel Deployment-Konfiguration
└── package.json          # Root-Scripts
```

## 🚀 Quick Start

### Voraussetzungen

- **Node.js >= 20**
- **pnpm >= 9.15** (`npm install -g pnpm@9.15`)
- **Expo CLI** (nur für Mobile: `npm install -g expo-cli`)

### Installation

```bash
# 1. Repo klonen
git clone git@github.com:munthernashar/articlio-monorepo.git
cd articlio-monorepo

# 2. Dependencies installieren
pnpm install

# 3. Environment Variables setzen
cp .env.example .env
# Bearbeite .env mit deinen Supabase-Credentials
```

### Entwicklung

```bash
# Alle Apps starten (Web + Mobile)
pnpm dev

# Nur Web-App starten
pnpm dev:web

# Nur Mobile-App starten
cd apps/mobile
pnpm dev
```

### Build

```bash
# Alle Apps bauen
pnpm build

# Nur Web-App bauen (Vercel macht das automatisch)
pnpm build:web

# Nur Mobile-App bauen (EAS Build)
cd apps/mobile
eas build --platform ios
eas build --platform android
```

## 📦 Shared Packages

### `@articlio/types`

Zentralisierte TypeScript-Typen:
- Database Schema (aus Supabase)
- API Response Types
- Domain Models

**Verwendung:**
```typescript
import type { Profile, Session, Prompt } from '@articlio/types'
```

### `@articlio/api`

Supabase-Client und API-Funktionen:
- Auth (login, logout, session management)
- Profile (get, update)
- Automatische Environment-Variable-Erkennung (Vite + Expo)

**Verwendung:**
```typescript
import { signInWithEmailPassword, signOut, getCurrentUser } from '@articlio/api'
```

### `@articlio/utils`

Helper-Funktionen:
- `formatDate`, `formatDateTime`, `formatRelativeTime`
- `isValidEmail`, `isValidUrl`
- `truncateText`, `capitalize`, `slugify`

**Verwendung:**
```typescript
import { formatDate, truncateText } from '@articlio/utils'
```

### `@articlio/ui`

Geteilte UI-Komponenten:
- `BlogCard` (Prompt/Article Card)
- `LoadingSpinner`
- `ErrorBoundary`

**Verwendung:**
```typescript
import { BlogCard, LoadingSpinner } from '@articlio/ui'
```

## 🔧 Tech Stack

| Bereich | Technologie |
|---------|-------------|
| **Web** | Vite + React 19 + TypeScript |
| **Mobile** | Expo SDK 54 + React Native + TypeScript |
| **Backend** | Supabase (PostgreSQL, Auth, Storage) |
| **Build** | Turborepo + pnpm Workspaces |
| **Deployment** | Vercel (Web) + EAS Build (Mobile) |

## 🌐 Vercel Deployment (Web-App)

### Einrichtung

1. **Vercel Account verbinden:**
   - Gehe zu [vercel.com](https://vercel.com)
   - Klicke "Add New Project"
   - Wende dein GitHub-Repo `articlio-monorepo` aus

2. **Einstellungen konfigurieren:**
   - **Framework Preset:** Vite
   - **Root Directory:** `.` (lassen)
   - **Build Command:** `pnpm --filter=web build`
   - **Output Directory:** `apps/web/dist`
   - **Install Command:** `pnpm install`

3. **Environment Variables hinzufügen:**
   - `VITE_SUPABASE_URL` = deine Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = dein Supabase Anon Key

4. **Deploy:**
   - Klicke "Deploy"
   - Vercel baut automatisch bei jedem `git push`

### Alternative: `vercel.json`

Die `vercel.json` im Repo-Root konfiguriert Vercel automatisch:

```json
{
  "buildCommand": "pnpm --filter=web build",
  "outputDirectory": "apps/web/dist",
  "installCommand": "pnpm install"
}
```

Vercel erkennt diese Konfiguration und verwendet sie automatisch.

## 📱 Mobile App Stores

### iOS

**Voraussetzungen:**
- Apple Developer Account ($99/Jahr)
- macOS mit Xcode (oder EAS Build in der Cloud)

**Build & Deploy:**
```bash
cd apps/mobile

# Development Build (zum Testen auf deinem iPhone)
eas build --platform ios --profile development

# Production Build (App Store)
eas build --platform ios --profile production
eas submit --platform ios
```

### Android

**Voraussetzungen:**
- Google Play Developer Account ($25 einmalig)

**Build & Deploy:**
```bash
cd apps/mobile

# Development Build (APK)
eas build --platform android --profile development

# Production Build (Play Store)
eas build --platform android --profile production
eas submit --platform android
```

## 🔐 Environment Variables

### Root `.env` (lokale Entwicklung)

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Web-App (`apps/web/.env`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Mobile-App (`apps/mobile/.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 🔄 Workflow: Änderungen an Shared Packages

### Beispiel: Neue API-Funktion hinzufügen

1. **In `packages/api/src/auth.ts` ändern:**
```typescript
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  return { error }
}
```

2. **In beiden Apps verwenden:**
```typescript
// apps/web/src/components/ResetPassword.tsx
import { resetPassword } from '@articlio/api'

// apps/mobile/app/reset-password.tsx
import { resetPassword } from '@articlio/api'
```

3. **Commit & Push:**
```bash
git add .
git commit -m "feat: Add reset password function"
git push
```

**Vorteil:** Beide Apps verwenden den gleichen Code, kein Copy-Paste!

## 🧪 Testing

```bash
# Alle Tests
pnpm test

# Nur Web-Tests
pnpm test --filter=web

# Nur Shared Packages
pnpm test --filter=@articlio/api
pnpm test --filter=@articlio/utils
```

## 📝 License

Proprietary - Articlio 2026
