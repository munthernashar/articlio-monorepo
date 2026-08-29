# Onboarding-Sprachniveau Audit (Stand: 2026-05-06)

## Ist-Zustand
- Bei der Registrierung (`RegisterPage`) werden nur E-Mail, Passwort, Passwort-Bestätigung und Legal-Consent abgefragt; kein Sprachtest, kein CEFR-Assessment.
- Nach Login erzwingt `ProtectedRoute` das Onboarding, solange `onboarding_completed=false`.
- Im Onboarding wird `german_level` explizit manuell per Select (`A1`-`C2`) gesetzt.
- `profileService.completeOnboarding(...)` speichert dieses vom Nutzer gewählte Niveau in `profiles.german_level` und markiert `onboarding_completed=true`.
- In der DB-Dokumentation ist `german_level` als optionales CEFR-Feld dokumentiert.

## Bewertung: Ist ein automatischer Sprachtest zwingend notwendig?
Kurz: **Nein, aktuell nicht zwingend.**

Begründung:
1. Die bestehende Produktlogik funktioniert bereits mit einem selbstdeklarierten CEFR-Level.
2. Ein Sprachtest erhöht Friktion im kritischen Registrierungspfad.
3. Ohne klaren Nachweis, dass falsche Selbsteinschätzung Lernqualität oder Retention messbar schädigt, ist der Zusatzaufwand wahrscheinlich zu hoch.

## Empfohlener Minimal-Ansatz ("nicht mehr als nötig")
1. **Beibehalten:** Self-Assessment im Onboarding (wie heute).
2. **Ergänzen (leichtgewichtig):** "Ich kenne mein Niveau nicht"-Option, die auf einen konservativen Startwert (z. B. A2) setzt.
3. **Später optional:** Mikro-Kalibrierung nach 1-2 Sessions (stiller Re-Score im Hintergrund statt harter Test vor Produktnutzung).
4. **Nur wenn Metriken es zeigen:** Vollwertiger standardisierter Sprachtest als optionaler, nicht-blockierender Dialog.

## Wenn ihr doch einen Test einbauen wollt
- Nicht direkt in den Signup-Submit blockieren.
- Besser als nachgelagerter Onboarding-Dialog mit "Überspringen".
- Ergebnis als "provisional" markieren und nach echten Nutzungsdaten validieren.

## UI-Hinweis (Tailwind/Figma Glass)
Das aktuelle UI nutzt projektweit eigene Klassen/Designsystem-Strukturen (`auth-page`, `auth-card`, `auth-form`, `button`).
Ein reiner Tailwind-Glass-Dialog sollte deshalb nur eingeführt werden, wenn ihr bewusst auf diesen Screen Tailwind als zusätzliche Stil-Schicht akzeptiert oder die bestehenden Komponenten erweitert.
