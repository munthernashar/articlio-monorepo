# Articlio Monorepo

Ein Monorepo für die Articlio-Plattform mit Web-App (Vite + React) und Mobile-App (Expo + React Native).

## 🏗️ Struktur

```
articlio-monorepo/
├── apps/
│   ├── web/              # Vite + React Web-App
│   └── mobile/           # Expo + React Native Mobile-App
├── packages/
│   ├── types/            # TypeScript-Typen (shared)
│   ├── api/              # Supabase-Client & API-Calls (shared)
│   ├── utils/            # Helper-Funktionen (shared)
│   └── ui/               # UI-Komponenten (shared)
├── turbo.json            # Turborepo-Konfiguration
├── pnpm-workspace.yaml   # pnpm Workspaces
└── package.json          # Root-Scripts
```

## 🚀 Quick Start

### Voraussetzungen

- Node.js >= 20
- pnpm >= 9.15
- Expo CLI ( für Mobile)

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
# Alle Apps starten
pnpm dev

# Nur Web-App
pnpm dev:web

# Nur Mobile-App
pnpm dev:mobile
```

### Build

```bash
# Alle Apps bauen
pnpm build

# Nur Web-App
pnpm build:web

# Nur Mobile-App (EAS Build)
pnpm build:mobile
```

## 📦 Shared Packages

### `@articlio/types`

Zentralisierte TypeScript-Typen für:
- Datenbank-Modelle (aus Supabase)
- API-Responses
- UI-Props

### `@articlio/api`

Supabase-Client und API-Funktionen:
- Auth (Login, Logout, Session-Management)
- Blog-Posts (CRUD, Filter, Search)
- Comments & Interactions

### `@articlio/utils`

Helper-Funktionen:
- Date-Formatting
- String-Utilities
- Validation-Functions

### `@articlio/ui`

Geteilte UI-Komponenten:
- BlogCard
- CommentList
- LoadingSpinner
- ErrorBoundary

## 🔧 Tech Stack

| Bereich | Technologie |
|---------|-------------|
| **Web** | Vite + React 19 + TypeScript |
| **Mobile** | Expo SDK 54 + React Native + TypeScript |
| **Backend** | Supabase (PostgreSQL, Auth, Storage) |
| **Build** | Turborepo + pnpm Workspaces |
| **Deployment** | Vercel (Web) + EAS (Mobile) |

## 📱 Mobile App Stores

### iOS

- Apple Developer Account erforderlich ($99/Jahr)
- Build mit: `cd apps/mobile && eas build --platform ios`
- Submit via: `eas submit --platform ios`

### Android

- Google Play Account erforderlich ($25 einmalig)
- Build mit: `cd apps/mobile && eas build --platform android`
- Submit via: `eas submit --platform android`

## 🔐 Environment Variables

Erstelle `.env` im Root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Web (optional)
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Mobile (wird von Expo automatisch geladen)
EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
```

## 🧪 Testing

```bash
# Alle Tests
pnpm test

# Nur Web-Tests
pnpm test --filter=web

# Nur Shared Packages
pnpm test --filter=@articlio/api
```

## 📝 License

Proprietary - Articlio 2026
