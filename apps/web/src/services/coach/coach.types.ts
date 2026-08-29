export type CoachTrainingRecommendationInput = {
  learnerProfile: Record<string, unknown>;
  patternSummary: Record<string, unknown>;
  availableTime: string;
};

export type CoachTrainingRecommendationOutput = {
  recommendation: string;
  rationale: string;
  practiceFormat: string;
  timeScope: string;
};

export type CoachSessionPlanInput = {
  learnerLevel: string;
  focusTopic: string;
  observedPatterns: string[];
  recentNotes: string;
  learningGoalContext: string;
};

export type CoachSessionPlanTask = {
  mode?: string;
  prompt?: string;
  transition?: string;
  preferredInput?: string;
};

export type CoachSessionPlanOutput = {
  objective: string;
  priorities: string[];
  sessionFocus: string;
  successSignal: string;
  tasks?: CoachSessionPlanTask[];
};

export type CoachNextStepInput = {
  sessionGoal: string;
  learnerTurn: string;
  context: Record<string, unknown>;
  learningGoalContext: string;
};

export type CoachStepType = 'clarify' | 'practice' | 'transfer' | 'review';

export type CoachNextTaskSuggestion = {
  mode?: string;
  prompt?: string;
  preferredInput?: string;
};

export type CoachNextStepOutput = {
  stepType: CoachStepType;
  coachMessage: string;
  learnerAction: string;
  reason: string;
  followupQuestion?: string;
  nextTask?: CoachNextTaskSuggestion;
};

export type CoachSessionCompletionInput = {
  sessionGoal: string;
  sessionFindings: Record<string, unknown>;
  currentState: string;
  learningGoalContext: string;
};

export type CoachCompletionStatus = 'completed' | 'partially_completed' | 'not_completed';

export type CoachSessionCompletionOutput = {
  completionStatus: CoachCompletionStatus;
  summary: string;
  retainedStrength: string;
  remainingFocus: string;
  nextSessionHint: string;
};

export type CoachInterpretReflectionInput = {
  learnerReflection: string;
  learningContext: string;
  recentSignals: string[];
  learningGoalContext: string;
};

export type CoachReflectionState = 'stable' | 'uncertain' | 'overloaded' | 'confident';

export type CoachInterpretReflectionOutput = {
  reflectionState: CoachReflectionState;
  interpretedNeed: string;
  supportiveResponse: string;
  suggestedFocus: string;
};

export type CoachTaskMode =
  | 'connect'
  | 'fill_connector'
  | 'rephrase'
  | 'free_response'
  | 'daily_situation'
  | 'explain_cause'
  | 'contrast'
  | 'continue_dialogue';

export type CoachTaskPlanItem = {
  mode: CoachTaskMode;
  prompt: string;
  transition: string;
  recommendedInput: 'text' | 'voice' | 'mixed';
};

export type CoachSessionState = {
  totalTasks: number;
  completedTasks: number;
  currentPrompt: string;
  level: number;
  taskPlan: CoachTaskPlanItem[];
  currentMode: CoachTaskMode;
  recommendedInput: 'text' | 'voice' | 'mixed';
};

export type SessionMemory = {
  pathKey: string;
  lastModes: CoachTaskMode[];
  stablePhrases: string[];
  difficultTransitions: string[];
  lastFreeResponseStyle?: string;
  lastDailySituation?: string;
  transferReadiness: number;
  sessionsCompleted: number;
  lastReflection?: string;
  lastReflectionFocus?: string;
  updatedAt: string;
};

export type TrainingPathLabel = 'Heute wieder sinnvoll' | 'Im Fluss' | 'Gut zum Festigen' | 'Stabil im Alltag';

export type TrainingPath = {
  id: string;
  title: string;
  focusTopic: string;
  reason: string;
  currentStrengthLabel: string;
  recommendedFrequency: string;
  lastPracticedAt: string | null;
  nextRecommendedAt: string | null;
  label: TrainingPathLabel;
  recentWins?: string[];
  recentChallenges?: string[];
  coachNote?: string;
  priorityScore?: number;
  skippedSessions?: number;
  developmentLine?: string;
};
