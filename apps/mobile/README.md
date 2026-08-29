# Articlio Mobile App

React Native / Expo App für iOS und Android.

## 🚀 Quick Start

### Voraussetzungen

- Node.js 20+ (`nvm use` im Root-Verzeichnis)
- pnpm (`npm install -g pnpm`)
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Xcode (iOS) oder Android Studio (Android)

### Installation

```bash
# Im Root-Verzeichnis
cd ../.. 
pnpm install

# Im Mobile-Verzeichnis
cd apps/mobile
pnpm install
```

### Development Build

```bash
# Metro Dev Server starten
pnpm expo start

# iOS Simulator
pnpm expo run:ios

# Android Emulator
pnpm expo run:android

# Auf physischem Gerät (QR-Code scannen mit Expo Go App)
pnpm expo start --tunnel
```

## 📱 Production Builds

### Mit EAS Build (Empfohlen)

```bash
# Login bei Expo
eas login

# Build konfigurieren
eas build:configure

# iOS Build für App Store
eas build --platform ios --profile production

# Android Build für Play Store
eas build --platform android --profile production

# Build für Testflight / Internal Testing
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

### Lokale Builds (ohne EAS)

```bash
# iOS
pnpm expo run:ios --device

# Android
pnpm expo run:android --device
```

## 🏗️ Architektur

### Verzeichnisstruktur

```
apps/mobile/
├── app/              # Expo Router Pages
│   ├── _layout.tsx   # Root Layout
│   ├── index.tsx     # Home Screen
│   └── login.tsx     # Login Screen
├── assets/           # Bilder, Fonts, Icons
├── components/       # Mobile-spezifische Components
├── app.json          # Expo Konfiguration
├── eas.json          # EAS Build Konfiguration
├── metro.config.js   # Metro Bundler Config
└── package.json
```

### Code-Sharing mit Web

Gemeinsamer Code liegt in `packages/`:

- `packages/api` - Supabase Client, API-Calls
- `packages/types` - TypeScript Types
- `packages/utils` - Shared Utilities
- `packages/ui` - Shared UI Components (wenn vorhanden)

Import im Mobile-Code:

```typescript
import { getSupabaseClient } from '@articlio/api';
import type { UserProfile } from '@articlio/types';
```

## 🔧 Environment Variables

`.env` Datei im `apps/mobile` Verzeichnis:

```env
EXPO_PUBLIC_SUPABASE_URL=https://pkmwdhjohidkkjkrlcnt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=https://articlio-monorepo.vercel.app
```

## 📤 Deployment

### App Store (iOS)

1. Build erstellen: `eas build --platform ios --profile production`
2. Zu TestFlight hochladen: `eas submit --platform ios`
3. In App Store Connect verifizieren und verifizieren

### Play Store (Android)

1. Build erstellen: `eas build --platform android --profile production`
2. Zu Play Console hochladen: `eas submit --platform android`
3. Im Play Store verifizieren und verifizieren

## 🧪 Testing

```bash
# Unit Tests
pnpm test

# E2E Tests (mit Detox oder Maestro)
pnpm test:e2e
```

## 🐛 Troubleshooting

### Cache-Probleme

```bash
# Expo Cache leeren
pnpm expo start -c

# Metro Cache leeren
pnpm expo start --clear

# Node Modules neu installieren
rm -rf node_modules
pnpm install
```

### iOS Build-Fehler

```bash
# CocoaPods neu installieren
cd ios
pod install
cd ..
```

### Android Build-Fehler

```bash
# Gradle Cache leeren
cd android
./gradlew clean
cd ..
```

## 📚 Resources

- [Expo Docs](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/)
- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
