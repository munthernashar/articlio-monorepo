export const PRODUCT_VOCABULARY = {
  session: 'Session',
  sessionAnalysis: 'Sprachprofil',
  focusTopics: 'Fokusbereiche',
  tutor: 'Coach',
  tutorSession: 'Coaching',
  training: 'Geführtes Coaching',
  progress: 'Fortschritt',
} as const;

export type ProductStatusTone =
  | 'neutral'
  | 'positive'
  | 'progress'
  | 'warning'
  | 'critical';

export interface ProductStatus {
  key: string;
  label: string;
  description: string;
  tone: ProductStatusTone;
}

const DIALOGUE_STATUS_MAP: Readonly<Record<string, ProductStatus>> = {
  draft: {
    key: 'ready',
    label: 'Bereit',
    description: 'Die Session ist bereit zum Starten.',
    tone: 'neutral',
  },
  recording: {
    key: 'active',
    label: 'Aktiv',
    description: 'Die Session läuft gerade.',
    tone: 'progress',
  },
  uploaded: {
    key: 'reflecting',
    label: 'Wird analysiert',
    description: 'Dein Sprachprofil wird vorbereitet.',
    tone: 'progress',
  },
  transcribed: {
    key: 'reflecting',
    label: 'Wird analysiert',
    description: 'Dein Sprachprofil wird vorbereitet.',
    tone: 'progress',
  },
  analyzed: {
    key: 'analysis_completed',
    label: 'Analysiert',
    description: 'Die Analyse ist abgeschlossen. Ergebnisse werden vorbereitet.',
    tone: 'positive',
  },
  feedback_ready: {
    key: 'insights_ready',
    label: 'Analyse bereit',
    description: 'Dein Sprachprofil ist bereit zur Ansicht.',
    tone: 'positive',
  },
  training_in_progress: {
    key: 'in_coaching',
    label: 'Im Coaching',
    description: 'Dein Coaching läuft gerade.',
    tone: 'progress',
  },
  completed: {
    key: 'complete',
    label: 'Session abgeschlossen',
    description: 'Die Session ist abgeschlossen.',
    tone: 'positive',
  },
  completed_capped: {
    key: 'complete_capped',
    label: 'Session abgeschlossen (begrenzt)',
    description: 'Die Session wurde abgeschlossen; Ergebnisse sind aufgrund von Limits gekürzt.',
    tone: 'warning',
  },
  insufficient_data: {
    key: 'insufficient_data',
    label: 'Zu wenig Daten',
    description: 'Für eine vollständige Auswertung liegen nicht genügend Daten vor.',
    tone: 'warning',
  },
  rejected_too_long: {
    key: 'rejected_too_long',
    label: 'Zu lang',
    description: 'Die Session war zu lang und konnte nicht vollständig verarbeitet werden.',
    tone: 'critical',
  },
  failed: {
    key: 'needs_attention',
    label: 'Aufmerksamkeit erforderlich',
    description: 'Diese Session benötigt Aufmerksamkeit, bevor es weitergeht.',
    tone: 'critical',
  },
  archived: {
    key: 'archived',
    label: 'Archiviert',
    description: 'Diese Session wurde archiviert.',
    tone: 'neutral',
  },
} as const;

const FOCUS_AREA_STATUS_MAP: Readonly<Record<string, ProductStatus>> = {
  unentdeckt: {
    key: 'not_yet_detected',
    label: 'Noch nicht erkannt',
    description: 'Bisher wurde kein Fokusbereich erkannt.',
    tone: 'neutral',
  },
  beobachtet: {
    key: 'observed',
    label: 'Beobachtet',
    description: 'Dieser Fokusbereich wurde erkannt.',
    tone: 'progress',
  },
  wiederkehrend: {
    key: 'recurring',
    label: 'Wiederkehrend',
    description: 'Dieser Fokusbereich tritt wiederholt auf.',
    tone: 'warning',
  },
  in_training: {
    key: 'in_coaching',
    label: 'Im Coaching',
    description: 'Dieser Fokusbereich wird aktuell im Coaching bearbeitet.',
    tone: 'progress',
  },
  teilweise_stabilisiert: {
    key: 'stabilizing',
    label: 'Stabilisiert sich',
    description: 'Dieser Fokusbereich zeigt erste Stabilisierung.',
    tone: 'progress',
  },
  stabil: {
    key: 'stable',
    label: 'Stabil',
    description: 'Dieser Fokusbereich ist stabil.',
    tone: 'positive',
  },
  rueckfall_erkannt: {
    key: 'needs_reinforcement',
    label: 'Vertiefung empfohlen',
    description: 'Dieser Fokusbereich sollte erneut vertieft werden.',
    tone: 'warning',
  },
} as const;

const DEFAULT_STATUS: ProductStatus = {
  key: 'in_progress',
  label: 'In Bearbeitung',
  description: 'Der Status wird aktualisiert.',
  tone: 'neutral',
};

export function mapDialogueStatusToProductStatus(status: string): ProductStatus {
  return DIALOGUE_STATUS_MAP[status] ?? DEFAULT_STATUS;
}

export function mapFocusAreaStatusToProductStatus(status: string): ProductStatus {
  return FOCUS_AREA_STATUS_MAP[status] ?? DEFAULT_STATUS;
}
