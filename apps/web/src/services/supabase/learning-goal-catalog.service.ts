import { supabaseClient } from '@/services/supabase/client';
import type { CefrBand } from '@/services/supabase/session-analysis.service';

export type LearningGoalType = 'language_level' | 'knowledge';

export type LearningGoalCategory = 'integration' | 'beruf' | 'familie' | 'allgemein';

export type LearningGoalContract = {
  goalKey: string;
  displayName: string;
  category: LearningGoalCategory;
  goalType: LearningGoalType;
  targetCefrBand: CefrBand | null;
  description: string;
  focusAreas: string[];
  sortOrder: number;
};

type LearningGoalCatalogRow = {
  goal_key: string;
  display_name: string;
  category: string;
  goal_type: string;
  target_cefr_band: string | null;
  description: string;
  focus_areas: unknown;
  sort_order: number;
};

// Fallback, falls die Katalog-Tabelle nicht erreichbar ist -- Auswahl bleibt
// nutzbar, auch ohne aktuelle Katalog-Texte. Muss inhaltlich mit der Seed-Migration
// (20260826110000_create_learning_goal_catalog.sql) übereinstimmen.
const FALLBACK_LEARNING_GOALS: LearningGoalContract[] = [
  {
    goalKey: 'dtz',
    displayName: 'Deutsch-Test für Zuwanderer (DTZ)',
    category: 'integration',
    goalType: 'language_level',
    targetCefrBand: 'B1.1',
    description: 'Abschlusstest des Integrationskurs-Sprachmoduls (Niveaustufen A2/B1).',
    focusAreas: ['Alltagsgespräche', 'Behördensituationen', 'Arbeitsleben'],
    sortOrder: 10,
  },
  {
    goalKey: 'einbuergerung_b1',
    displayName: 'Einbürgerung (Sprachteil)',
    category: 'integration',
    goalType: 'language_level',
    targetCefrBand: 'B1.2',
    description: 'Sprachnachweis B1 in allen vier Fertigkeiten für die Einbürgerung.',
    focusAreas: ['Alltagsgespräche', 'Meinungen äußern', 'Behördensituationen'],
    sortOrder: 20,
  },
  {
    goalKey: 'ehegattennachzug_a1',
    displayName: 'Ehegattennachzug',
    category: 'familie',
    goalType: 'language_level',
    targetCefrBand: 'A1.2',
    description: 'Einfache Deutschkenntnisse (A1) als Voraussetzung für das Visum zum Ehegattennachzug.',
    focusAreas: ['Sich vorstellen', 'Einfache Alltagssituationen', 'Familie und Wohnen'],
    sortOrder: 30,
  },
  {
    goalKey: 'fsp_aerzte',
    displayName: 'Fachsprachprüfung Ärzte',
    category: 'beruf',
    goalType: 'language_level',
    targetCefrBand: 'C1.2',
    description: 'Medizinische Fachsprachprüfung (FSP) der Landesärztekammern, Voraussetzung für die Approbation.',
    focusAreas: ['Anamnesegespräch', 'Patientenübergabe', 'Arztbrief', 'Aufklärungsgespräch'],
    sortOrder: 40,
  },
  {
    goalKey: 'pflege_b1_b2',
    displayName: 'telc Deutsch B1-B2 Pflege',
    category: 'beruf',
    goalType: 'language_level',
    targetCefrBand: 'B2.1',
    description: 'Zweistufige Prüfung für Pflegekräfte (B1/B2), Pflegefachsprache und Patientengespräch-Szenarien.',
    focusAreas: ['Übergabegespräch', 'Patientengespräch', 'Pflegedokumentation'],
    sortOrder: 50,
  },
  {
    goalKey: 'allgemein_zertifikat',
    displayName: 'Allgemeines Zertifikat (Goethe/telc)',
    category: 'allgemein',
    goalType: 'language_level',
    targetCefrBand: null,
    description: 'Standard-Sprachzertifikat ohne Berufsbezug - das Ziel-Niveau ergibt sich aus deinem Deutsch-Niveau im Profil.',
    focusAreas: [],
    sortOrder: 60,
  },
  {
    goalKey: 'leben_in_deutschland',
    displayName: 'Leben in Deutschland',
    category: 'integration',
    goalType: 'knowledge',
    targetCefrBand: null,
    description: 'Wissenstest zu Politik, Geschichte und Gesellschaft - der Coach lässt dich Antworten mündlich in eigenen Worten erklären.',
    focusAreas: ['Grundrechte', 'Bundestag und Wahlen', 'Föderalismus', 'Geschichte', 'Gleichberechtigung'],
    sortOrder: 70,
  },
];

function isLearningGoalCategory(value: string): value is LearningGoalCategory {
  return value === 'integration' || value === 'beruf' || value === 'familie' || value === 'allgemein';
}

function isLearningGoalType(value: string): value is LearningGoalType {
  return value === 'language_level' || value === 'knowledge';
}

function mapRow(row: LearningGoalCatalogRow): LearningGoalContract | null {
  if (!isLearningGoalCategory(row.category) || !isLearningGoalType(row.goal_type)) {
    return null;
  }

  const focusAreas = Array.isArray(row.focus_areas)
    ? row.focus_areas.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    goalKey: row.goal_key,
    displayName: row.display_name,
    category: row.category,
    goalType: row.goal_type,
    targetCefrBand: (row.target_cefr_band as CefrBand | null) ?? null,
    description: row.description,
    focusAreas,
    sortOrder: row.sort_order,
  };
}

/**
 * Baut den {{learning_goal_context}}-Text für daily_prompt_generator/session_analysis
 * (Phase C). "Leben in Deutschland" (goal_type 'knowledge') hat kein CEFR-Ziel und
 * bekommt bewusst noch keinen Kontext -- der eigene Wissens-Coaching-Mechanismus
 * dafür ist eine spätere, separate Phase. Ohne gesetztes Ziel liefert dies einen
 * leeren String, damit sich das Prompt-Verhalten für diese Nutzer nicht ändert.
 */
export function buildLearningGoalContextText(goal: LearningGoalContract | null, fallbackGermanLevel: string | null): string {
  if (!goal || goal.goalType !== 'language_level') {
    return '';
  }

  const targetBand = goal.targetCefrBand ?? fallbackGermanLevel ?? null;
  const parts = [`Ziel: ${goal.displayName}`];
  if (targetBand) {
    parts.push(`Ziel-Niveau: ${targetBand}`);
  }
  if (goal.focusAreas.length > 0) {
    parts.push(`Fokus: ${goal.focusAreas.join(', ')}`);
  }

  return `${parts.join('. ')}.`;
}

export const learningGoalCatalogService = {
  async listActiveGoals(): Promise<LearningGoalContract[]> {
    const learningGoalClient = supabaseClient as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: boolean) => {
            order: (column: string, options: { ascending: boolean }) => Promise<{
              data: LearningGoalCatalogRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };

    const { data, error } = await learningGoalClient
      .from('learning_goal_catalog')
      .select('goal_key, display_name, category, goal_type, target_cefr_band, description, focus_areas, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return FALLBACK_LEARNING_GOALS;
    }

    const mappedGoals = ((data ?? []) as LearningGoalCatalogRow[])
      .map(mapRow)
      .filter((goal): goal is LearningGoalContract => goal !== null);

    return mappedGoals.length > 0 ? mappedGoals : FALLBACK_LEARNING_GOALS;
  },
};
