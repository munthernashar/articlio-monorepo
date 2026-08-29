import { getFocusTopicStatusLabel } from '@/features/focus-topic/status-labels';
import type { FocusTopicStatus } from '@/types/database';

export const FOCUS_MASTERY_LEVEL_MIN = 0;
export const FOCUS_MASTERY_LEVEL_MAX = 5;
export const FOCUS_MASTERY_THRESHOLD_LOW_MAX = 1;
export const FOCUS_MASTERY_THRESHOLD_HIGH_MIN = 4;

export type FocusMasteryBand = 'low' | 'mid' | 'high';

export type FocusTopicPolicy = {
  statusLabel: string;
  masteryLevel: number;
  masteryBand: FocusMasteryBand;
  tutor: {
    isReleased: boolean;
    goal: string;
  };
  progress: {
    narrative: string;
    cta: string;
  };
  learningLoop: {
    isOpen: boolean;
    status: 'offen' | 'geschlossen';
    detail: string;
  };
};

type PolicyCell = {
  tutor: FocusTopicPolicy['tutor'];
  progress: FocusTopicPolicy['progress'];
  learningLoop: Pick<FocusTopicPolicy['learningLoop'], 'isOpen' | 'detail'>;
};

type PolicyMatrix = Record<FocusTopicStatus, Record<FocusMasteryBand, PolicyCell>>;

const POLICY_MATRIX: PolicyMatrix = {
  unentdeckt: {
    low: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald wir ein Thema für dich gefunden haben.' },
      progress: { narrative: 'Wir haben noch kein Thema für dich gefunden.', cta: 'Nimm noch ein, zwei freie Sessions auf, dann wissen wir mehr.' },
      learningLoop: { isOpen: true, detail: 'Es geht los, sobald sich ein Thema öfter zeigt.' },
    },
    mid: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald wir ein Thema für dich gefunden haben.' },
      progress: { narrative: 'Wir haben noch kein Thema für dich gefunden.', cta: 'Nimm noch ein, zwei freie Sessions auf, dann wissen wir mehr.' },
      learningLoop: { isOpen: true, detail: 'Es geht los, sobald sich ein Thema öfter zeigt.' },
    },
    high: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald wir ein Thema für dich gefunden haben.' },
      progress: { narrative: 'Wir haben noch kein Thema für dich gefunden.', cta: 'Nimm noch ein, zwei freie Sessions auf, dann wissen wir mehr.' },
      learningLoop: { isOpen: true, detail: 'Es geht los, sobald sich ein Thema öfter zeigt.' },
    },
  },
  beobachtet: {
    low: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald sich ein klares Thema zeigt.' },
      progress: { narrative: 'Wir sehen ein erstes Muster, brauchen aber noch mehr Sessions.', cta: 'Nimm ein paar weitere freie Sessions auf.' },
      learningLoop: { isOpen: true, detail: 'Wir beobachten das noch, bevor wir sicher sind.' },
    },
    mid: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald sich ein klares Thema zeigt.' },
      progress: { narrative: 'Wir sehen ein erstes Muster, brauchen aber noch mehr Sessions.', cta: 'Nimm ein paar weitere freie Sessions auf.' },
      learningLoop: { isOpen: true, detail: 'Wir beobachten das noch, bevor wir sicher sind.' },
    },
    high: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald sich ein klares Thema zeigt.' },
      progress: { narrative: 'Wir sehen ein erstes Muster, brauchen aber noch mehr Sessions.', cta: 'Nimm ein paar weitere freie Sessions auf.' },
      learningLoop: { isOpen: true, detail: 'Wir beobachten das noch, bevor wir sicher sind.' },
    },
  },
  wiederkehrend: {
    low: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald du aktiv daran arbeitest.' },
      progress: { narrative: 'Das taucht öfter auf -- das üben wir als Nächstes.', cta: 'Noch eine freie Session, dann starten wir gezielt.' },
      learningLoop: { isOpen: true, detail: 'Das Thema ist erkannt, das Training startet gleich.' },
    },
    mid: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald du aktiv daran arbeitest.' },
      progress: { narrative: 'Das taucht öfter auf -- das üben wir als Nächstes.', cta: 'Noch eine freie Session, dann starten wir gezielt.' },
      learningLoop: { isOpen: true, detail: 'Das Thema ist erkannt, das Training startet gleich.' },
    },
    high: {
      tutor: { isReleased: false, goal: 'Der Coach startet, sobald du aktiv daran arbeitest.' },
      progress: { narrative: 'Das taucht öfter auf -- das üben wir als Nächstes.', cta: 'Noch eine freie Session, dann starten wir gezielt.' },
      learningLoop: { isOpen: true, detail: 'Das Thema ist erkannt, das Training startet gleich.' },
    },
  },
  in_training: {
    low: {
      tutor: { isReleased: true, goal: 'Wir bauen jetzt die Grundlagen auf und gehen die größten Stolpersteine an.' },
      progress: { narrative: 'Du übst gerade aktiv -- kurze, klare Korrekturen bringen dich am schnellsten weiter.', cta: 'Stell deinem Coach eine Frage und probier eine kurze Übung aus.' },
      learningLoop: { isOpen: true, detail: 'Du bist mittendrin -- das bleibt so, bis es sitzt.' },
    },
    mid: {
      tutor: { isReleased: true, goal: 'Wir festigen das Muster und üben, es auch in neuen Situationen anzuwenden.' },
      progress: { narrative: 'Du bekommst das Thema schon in mehreren Situationen gut hin.', cta: 'Nutze das Feedback deines Coaches in echten Alltagssätzen.' },
      learningLoop: { isOpen: true, detail: "Als Nächstes geht's darum, das auch in neuen Situationen anzuwenden." },
    },
    high: {
      tutor: { isReleased: true, goal: 'Wir feilen jetzt am letzten Feinschliff und den Ausnahmen.' },
      progress: { narrative: 'Du bist ganz nah dran -- jetzt zählt vor allem Konstanz.', cta: 'Kurzer Check mit deinem Coach, dann eine freie Session.' },
      learningLoop: { isOpen: true, detail: 'Fast geschafft -- bald sitzt das sicher.' },
    },
  },
  teilweise_stabilisiert: {
    low: {
      tutor: { isReleased: true, goal: 'Wir sichern die wackligen Stellen ab und festigen die Basis noch mal.' },
      progress: { narrative: 'Du machst Fortschritte, aber es gibt noch ein paar Lücken.', cta: 'Frag deinen Coach gezielt zur schwierigsten Situation.' },
      learningLoop: { isOpen: true, detail: 'Das sitzt schon teilweise, aber noch nicht durchgehend.' },
    },
    mid: {
      tutor: { isReleased: true, goal: 'Wir prüfen, ob das auch unter etwas Druck stabil bleibt.' },
      progress: { narrative: 'Der Trend zeigt klar nach oben, es wird zunehmend stabiler.', cta: 'Nimm eine freie Session ganz ohne Vorbereitung auf.' },
      learningLoop: { isOpen: true, detail: 'Es festigt sich -- jetzt zählt Konstanz über mehrere Sessions.' },
    },
    high: {
      tutor: { isReleased: true, goal: 'Wir bestätigen die Stabilität und planen, wie du das hältst.' },
      progress: { narrative: 'Ganz knapp vor stabil -- jetzt zählt regelmäßiges Üben.', cta: 'Feinschliff mit deinem Coach, danach ein kurzer Wiederholungsplan.' },
      learningLoop: { isOpen: true, detail: 'Fast geschafft -- nur noch ein paar letzte Schritte.' },
    },
  },
  stabil: {
    low: {
      tutor: { isReleased: false, goal: 'Kein aktives Training gerade -- wir behalten das Thema locker im Blick.' },
      progress: { narrative: 'Das sitzt schon gut, wir behalten es locker im Blick.', cta: 'Nutze deine nächste freie Session als kleinen Check.' },
      learningLoop: { isOpen: false, detail: 'Fürs Erste fertig -- wir schauen nur noch gelegentlich vorbei.' },
    },
    mid: {
      tutor: { isReleased: false, goal: 'Kein aktives Training gerade -- wir behalten das Thema locker im Blick.' },
      progress: { narrative: 'Das sitzt gut und ist gerade kein Schwerpunkt mehr.', cta: 'Bei Bedarf reicht eine kurze Wiederholung.' },
      learningLoop: { isOpen: false, detail: 'Fürs Erste fertig -- wir schauen nur noch gelegentlich vorbei.' },
    },
    high: {
      tutor: { isReleased: false, goal: 'Kein aktives Training gerade -- wir behalten das Thema locker im Blick.' },
      progress: { narrative: 'Das sitzt richtig gut -- Zeit für ein neues Thema.', cta: 'Nimm eine freie Session auf, dann finden wir dein nächstes Thema.' },
      learningLoop: { isOpen: false, detail: 'Das sitzt sicher -- gut gemacht.' },
    },
  },
  rueckfall_erkannt: {
    low: {
      tutor: { isReleased: true, goal: 'Wir frischen die Basics kurz auf, damit sie wieder sicher sitzen.' },
      progress: { narrative: "Das ist gerade wieder wackliger geworden -- wir gehen kurz und gezielt dagegen.", cta: 'Starte jetzt eine kurze Runde mit deinem Coach.' },
      learningLoop: { isOpen: true, detail: 'Wir arbeiten gerade aktiv daran, das wieder zu festigen.' },
    },
    mid: {
      tutor: { isReleased: true, goal: 'Wir finden die Stelle, an der es hakt, und festigen sie noch mal.' },
      progress: { narrative: "Trotz Fortschritt ist es gerade wieder wackliger -- wir setzen genau da an, wo's am meisten hakt.", cta: 'Mach einen kurzen Check mit deinem Coach anhand eines konkreten Beispiels.' },
      learningLoop: { isOpen: true, detail: 'Wir arbeiten daran, das schnell wieder zu festigen.' },
    },
    high: {
      tutor: { isReleased: true, goal: 'Wir schauen uns die Ausnahme noch mal genauer an, die dir gerade Schwierigkeiten macht.' },
      progress: { narrative: "Auf hohem Niveau hakt's meist nur an einer bestimmten Situation oder Ausnahme.", cta: 'Sprich kurz mit deinem Coach, dann direkt eine freie Session.' },
      learningLoop: { isOpen: true, detail: 'Wir bleiben dran, bis das wieder sicher sitzt.' },
    },
  },
};

export function clampFocusMasteryLevel(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FOCUS_MASTERY_LEVEL_MIN;
  return Math.min(FOCUS_MASTERY_LEVEL_MAX, Math.max(FOCUS_MASTERY_LEVEL_MIN, Math.round(value)));
}

export function getFocusMasteryBand(masteryLevel: number | null | undefined): FocusMasteryBand {
  const clamped = clampFocusMasteryLevel(masteryLevel);
  if (clamped <= FOCUS_MASTERY_THRESHOLD_LOW_MAX) return 'low';
  if (clamped >= FOCUS_MASTERY_THRESHOLD_HIGH_MIN) return 'high';
  return 'mid';
}

export function getFocusStatusLabel(status: FocusTopicStatus): string {
  return getFocusTopicStatusLabel(status, 'short');
}

export function getFocusTopicPolicy(input: {
  status: FocusTopicStatus | null | undefined;
  masteryLevel: number | null | undefined;
}): FocusTopicPolicy | null {
  if (!input.status) return null;
  const masteryLevel = clampFocusMasteryLevel(input.masteryLevel);
  const masteryBand = getFocusMasteryBand(masteryLevel);
  const cell = POLICY_MATRIX[input.status][masteryBand];
  return {
    statusLabel: getFocusStatusLabel(input.status),
    masteryLevel,
    masteryBand,
    tutor: cell.tutor,
    progress: cell.progress,
    learningLoop: {
      isOpen: cell.learningLoop.isOpen,
      status: cell.learningLoop.isOpen ? 'offen' : 'geschlossen',
      detail: cell.learningLoop.detail,
    },
  };
}


export function isTutorReleasedForFocus(input: {
  status: FocusTopicStatus | null | undefined;
  masteryLevel: number | null | undefined;
}): boolean {
  return getFocusTopicPolicy(input)?.tutor.isReleased === true;
}

export function isLearningLoopOpen(input: {
  status: FocusTopicStatus | null | undefined;
  masteryLevel: number | null | undefined;
}): boolean {
  return getFocusTopicPolicy(input)?.learningLoop.isOpen === true;
}

export const TUTOR_RELEASED_FOCUS_STATUSES: FocusTopicStatus[] = (
  Object.keys(POLICY_MATRIX) as FocusTopicStatus[]
).filter((status) => {
  const bands: FocusMasteryBand[] = ['low', 'mid', 'high'];
  return bands.some((band) => POLICY_MATRIX[status][band].tutor.isReleased);
});
