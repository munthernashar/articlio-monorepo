import { useEffect, useRef, useState } from 'react';
import { dailyPromptService } from '@/services/supabase/daily-prompt.service';
import { multiSessionPatternService } from '@/services/supabase/multi-session-pattern.service';
import { profileService } from '@/services/supabase/profile.service';
import { buildLearningGoalContextText, learningGoalCatalogService } from '@/services/supabase/learning-goal-catalog.service';

export type DailyPromptSuggestion = {
  title: string;
  promptText: string;
  rationale: string | null;
  followUpQuestions: string[];
  isLoading: boolean;
};

function buildFallback(staticTopic: string, isLoading: boolean): DailyPromptSuggestion {
  return {
    title: staticTopic,
    promptText: `Vorschlag für heute: ${staticTopic}. Möchtest du darüber sprechen?`,
    rationale: null,
    followUpQuestions: [],
    isLoading,
  };
}

export type DailyPromptSuggestionControls = {
  suggestion: DailyPromptSuggestion;
  /** "Anderes Thema": verlässt bewusst den KI-Vorschlag und zeigt stattdessen den übergebenen statischen Titel. */
  overrideWithStaticTopic: (topic: string) => void;
};

/**
 * UI/UX-Verbesserung 21.08.2026: ersetzt die statische Zufalls-Themenliste durch
 * einen personalisierten, KI-generierten Gesprächseinstieg (daily_prompt_generator,
 * bislang ungenutzt). Zeigt sofort den statischen Fallback (kein Warten auf den
 * KI-Aufruf), tauscht ihn aus, sobald die personalisierte Version da ist. Scheitert
 * der KI-Aufruf (Netzwerk, kein Fokus-Thema etc.), bleibt der statische Fallback
 * einfach stehen -- das ist ein Komfort-Feature, kein Blocker für den Session-Start.
 */
export function useDailyPromptSuggestion(
  userId: string | undefined,
  staticFallbackTopic: string,
  recentTopics: string[],
): DailyPromptSuggestionControls {
  const [suggestion, setSuggestion] = useState<DailyPromptSuggestion>(() => buildFallback(staticFallbackTopic, true));
  const recentTopicsRef = useRef(recentTopics);
  recentTopicsRef.current = recentTopics;

  useEffect(() => {
    setSuggestion((current) => (current.isLoading ? buildFallback(staticFallbackTopic, true) : current));
  }, [staticFallbackTopic]);

  const overrideWithStaticTopic = (topic: string) => {
    setSuggestion(buildFallback(topic, false));
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [focusTopic, profile, learningGoals] = await Promise.all([
          multiSessionPatternService.getActiveFocusTopic(userId).catch(() => null),
          profileService.getOnboardingProfile(userId).catch(() => null),
          learningGoalCatalogService.listActiveGoals().catch(() => []),
        ]);
        if (cancelled) return;

        const recentTopicsNow = recentTopicsRef.current;
        const recentSignal = recentTopicsNow.length > 0
          ? `Zuletzt gesprochen über: ${recentTopicsNow.join(', ')}.`
          : 'Erste Session, noch keine Historie.';

        const selectedGoal = learningGoals.find((goal) => goal.goalKey === profile?.learning_goal_key) ?? null;
        const learningGoalContext = buildLearningGoalContextText(selectedGoal, profile?.german_level ?? null);

        const output = await dailyPromptService.generateDailyPrompt({
          focusTopicTitle: focusTopic?.title ?? 'Noch kein Fokus-Thema festgelegt',
          germanLevel: profile?.german_level ?? 'B1',
          recentSignal,
          learningGoalContext,
        });
        if (cancelled) return;

        setSuggestion({
          title: output.title,
          promptText: output.prompt_text,
          rationale: output.rationale,
          followUpQuestions: Array.isArray(output.follow_up_questions) ? output.follow_up_questions : [],
          isLoading: false,
        });
      } catch (error) {
        console.debug('[useDailyPromptSuggestion] KI-Vorschlag fehlgeschlagen, bleibe beim statischen Fallback', {
          reason: error instanceof Error ? error.message : 'unknown_error',
        });
        if (!cancelled) {
          setSuggestion((current) => ({ ...current, isLoading: false }));
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { suggestion, overrideWithStaticTopic };
}
