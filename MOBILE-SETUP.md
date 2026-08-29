# 📱 Articlio Mobile App Setup Guide

Komplette Anleitung zur Einrichtung der nativen iOS und Android Apps.

## ✅ Status der Umsetzung

- [x] **1. Mobile-App lauffäº¤hig machen** - Expo/React Native Setup vorhanden
- [x] **2. Shared Package erstellen** - `packages/api` mit Supabase-Client
- [x] **3. EAS-Konfiguration prüfen** - Production-ready Config
- [x] **4. README für Mobile-Development** - `apps/mobile/README.md` erstellt

## 🏗️ Monorepo-Architektur

```
articlio-monorepo/
├── apps/
│   ├── web/           # Next.js/Vite Web App
│   └── mobile/        # Expo/React Native Mobile App
├── packages/
│   ├── api/          # Shared API-Clients (Supabase)
│   ├── types/        # TypeScript Types
│   ├── ui/           # Shared UI Components
│   └── utils/        # Shared Utilities
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 🚀 Quick Start

### 1. Dependencies installieren

```bash
# Im Root-Verzeichnis
pnpm install
```

### 2. Mobile App starten

```bash
cd apps/mobile

# Dev Server starten
pnpm expo start

# iOS Simulator
pnpm expo run:ios

# Android Emulator
pnpm expo run:android
```

### 3. Auf physischem Gerät testen

1. **Expo Go App** installieren (iOS App Store / Google Play Store)
2. QR-Code scannen, der im Terminal angezeigt wird

## 📦 Shared Code nutzen

### In Mobile-Code importieren:

```typescript
// Supabase Client
import { getSupabaseClient } from '@articlio/api';

// Types
import type { UserProfile, Session } from '@articlio/types';

// Utils
import { formatDate, calculateDuration } from '@articlio/utils';
```

### In Web-Code importieren:

```typescript
// Gleiche Imports wie in Mobile!
import { getSupabaseClient } from '@articlio/api';
import type { UserProfile } from '@articlio/types';
```

## 🔧 Environment Setup

### Mobile `.env` Datei

Erstelle `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://pkmwdhjohidkkjkrlcnt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<dein-anon-key>
EXPO_PUBLIC_API_URL=https://articlio-monorepo.vercel.app
```

### Web `.env` Datei

Erstelle `apps/web/.env`:

```env
VITE_SUPABASE_URL=https://pkmwdhjohidkkjkrlcnt.supabase.co
VITE_SUPABASE_ANON_KEY=<dein-anon-key>
VITE_API_URL=https://articlio-monorepo.vercel.app
```

## 📱 Production Builds

### iOS App Store

```bash
cd apps/mobile

# Login bei Expo
eas login

# Build für Production
eas build --platform ios --profile production

# Zu TestFlight hochladen
eas submit --platform ios
```

### Android Play Store

```bash
cd apps/mobile

# Build für Production
eas build --platform android --profile production

# Zu Play Console hochladen
eas submit --platform android
```

## 🧪 Testing

### Web App

```bash
cd apps/web
pnpm dev
```

Ö´ffne `http://localhost:5173` im Browser.

### Mobile App

```bash
cd apps/mobile
pnpm expo start
```

## 📚 Weitere Dokumentation

- **Mobile-Development:** `apps/mobile/README.md`
- **Web-Development:** `apps/web/README.md` (falls vorhanden)
- **Supabase Setup:** `SUPABASE-SETUP.md` (falls vorhanden)

## 🐛 Troubleshooting

### pnpm Workspace-Probleme

```bash
# Cache leeren
pnpm clean
pnpm install

# Workspace neu initialisieren
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### Mobile Build-Fehler

```bash
# Expo Cache leeren
pnpm expo start -c

# Node Modules neu installieren
cd apps/mobile
rm -rf node_modules
pnpm install
```

### Shared Package wird nicht gefunden

Stelle sicher, dass `pnpm-workspace.yaml` existiert:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## 🎯 Next Steps

1. **Code-Sharing ausbauen**: Mehr gemeinsame Logik in `packages/` auslagern
2. **UI Components teilen**: `packages/ui` für gemeinsame Components nutzen
3. **CI/CD einrichten**: GitHub Actions für automatische Builds
4. **Monitoring**: Sentry oder ähnliches für Error-Tracking einrichten

---

**Fragen?** Siehe `apps/mobile/README.md` für detaillierte Mobile-Anleitung.
