// Deno-Port der Typen aus src/services/ai/types.ts, die process-session für
// Schema-Validierung, Overcorrection-Guard und Structured Outputs braucht.
// Edge Functions laufen in einer separaten Deno-Runtime ohne Zugriff auf
// src/ -- dieselben Typen/Funktionen werden hier bewusst 1:1 dupliziert statt
// über einen Build-Schritt gebündelt, analog zu den bereits bestehenden
// _shared-Dateien in diesem Ordner.

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export type JsonSchema = {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: Array<string | number | boolean | null>;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
};

export type OvercorrectionFocusMode = 'top_impact_first' | 'first_n_only';

export type OvercorrectionGuardPolicy = {
  maxCorrections?: number;
  maxNextSteps?: number;
  tutorFollowupFields?: string[];
  maxTutorFollowupQuestions?: number;
  maxTutorTopicMarkers?: number;
  maxItemTextLength?: number;
  focusMode?: OvercorrectionFocusMode;
};
