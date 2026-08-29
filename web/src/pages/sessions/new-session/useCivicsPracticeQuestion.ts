import { useEffect, useState } from 'react';
import { profileService } from '@/services/supabase/profile.service';
import { civicsExamQuestionsService, type CivicsExamQuestion } from '@/services/supabase/civics-exam-questions.service';

export type CivicsPracticeQuestionState = {
  /** true, sobald feststeht, dass das Lernziel "Leben in Deutschland" ist -- auch wenn (noch) keine Frage geladen ist. */
  isCivicsGoal: boolean;
  question: CivicsExamQuestion | null;
  isLoading: boolean;
};

/**
 * Lernpfade Phase E2b: für das Wissens-Coaching-Ziel "Leben in Deutschland" wird statt des
 * generischen KI-Themenvorschlags (useDailyPromptSuggestion) eine echte Prüfungsfrage aus dem
 * offiziellen BAMF-Katalog präsentiert. Lädt einmal pro userId, damit die im Session-Start-Dialog
 * gezeigte Frage über den gesamten Aufnahme-Ablauf hinweg stabil bleibt (kein Refetch bei jedem
 * Re-Render).
 */
export function useCivicsPracticeQuestion(userId: string | undefined): CivicsPracticeQuestionState {
  const [state, setState] = useState<CivicsPracticeQuestionState>({ isCivicsGoal: false, question: null, isLoading: true });

  useEffect(() => {
    if (!userId) {
      setState({ isCivicsGoal: false, question: null, isLoading: false });
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const profile = await profileService.getOnboardingProfile(userId);
        if (cancelled) return;

        if (profile?.learning_goal_key !== 'leben_in_deutschland') {
          setState({ isCivicsGoal: false, question: null, isLoading: false });
          return;
        }

        const question = await civicsExamQuestionsService.getNextQuestionForUser(userId, profile.bundesland ?? null);
        if (cancelled) return;
        setState({ isCivicsGoal: true, question, isLoading: false });
      } catch (error) {
        console.debug('[useCivicsPracticeQuestion] Laden fehlgeschlagen, falle auf generischen Themenvorschlag zurück', {
          reason: error instanceof Error ? error.message : 'unknown_error',
        });
        if (!cancelled) {
          setState({ isCivicsGoal: false, question: null, isLoading: false });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
