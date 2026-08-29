import { describe, expect, it } from 'vitest';

import { computeMasteryLevel } from '@/services/supabase/improvement-check.service';
import { applyFocusEvent } from '@/services/domain/focus-topic-transitions';

describe('focus-topic transitions', () => {
  describe('A) Improvement', () => {
    it('führt die improved-Kette bis stabil aus', () => {
      const initialTimestamp = '2026-01-01T00:00:00.000Z';

      const step1 = applyFocusEvent('wiederkehrend', 'improvement_improved', {
        reason: 'check:improved',
        source: 'improvement_check.service',
        timestamp: initialTimestamp,
      });
      const step2 = applyFocusEvent(step1.nextStatus, 'improvement_improved', {
        reason: 'check:improved',
        source: 'improvement_check.service',
        timestamp: initialTimestamp,
        metadata: step1.metadata,
      });
      const step3 = applyFocusEvent(step2.nextStatus, 'improvement_improved', {
        reason: 'check:improved',
        source: 'improvement_check.service',
        timestamp: initialTimestamp,
        metadata: step2.metadata,
      });

      expect(step1.nextStatus).toBe('in_training');
      expect(step2.nextStatus).toBe('teilweise_stabilisiert');
      expect(step3.nextStatus).toBe('stabil');
      expect(step3.metadata.status_history).toHaveLength(3);
    });

    it('mappt worsened stabil->rueckfall_erkannt und teilweise_stabilisiert->wiederkehrend', () => {
      expect(
        applyFocusEvent('stabil', 'improvement_worsened', {
          reason: 'check:worsened',
          source: 'improvement_check.service',
        }).nextStatus,
      ).toBe('rueckfall_erkannt');

      expect(
        applyFocusEvent('teilweise_stabilisiert', 'improvement_worsened', {
          reason: 'check:worsened',
          source: 'improvement_check.service',
        }).nextStatus,
      ).toBe('wiederkehrend');
    });

    it('behält bei unchanged den Status bei', () => {
      expect(
        applyFocusEvent('stabil', 'improvement_unchanged', {
          reason: 'check:unchanged',
          source: 'improvement_check.service',
        }).nextStatus,
      ).toBe('stabil');
    });
  });

  describe('B) Fokus-Auswahl', () => {
    it('setzt focus_selected: beobachtet->in_training', () => {
      const transition = applyFocusEvent('beobachtet', 'focus_selected', {
        reason: 'selection:new_focus',
        source: 'multi_session_pattern.service',
      });

      expect(transition.nextStatus).toBe('in_training');
    });

    it('deaktiviert alten Fokus bei focus_replaced_by_new_selection', () => {
      const replaced = applyFocusEvent('in_training', 'focus_replaced_by_new_selection', {
        reason: 'selection:replaced',
        source: 'multi_session_pattern.service',
      });
      const newlySelected = applyFocusEvent('beobachtet', 'focus_selected', {
        reason: 'selection:new_focus',
        source: 'multi_session_pattern.service',
      });

      expect(replaced.nextStatus).toBe('beobachtet');
      expect(newlySelected.nextStatus).toBe('in_training');
    });
  });

  describe('C) Ungültige Transition', () => {
    it('wirft Fehler für stabil->unentdeckt (z. B. via focus_replaced_by_new_selection)', () => {
      expect(() =>
        applyFocusEvent('stabil', 'focus_replaced_by_new_selection', {
          reason: 'invalid:force_unentdeckt',
          source: 'system',
        }),
      ).toThrow('Ungültige Fokus-Transition: stabil --(focus_replaced_by_new_selection)-> ?');
    });
  });

  describe('D) Mastery', () => {
    it('hält Grenzen 0..5 immer ein', () => {
      const belowMin = computeMasteryLevel({
        currentLevel: -100,
        currentDecision: 'worsened',
        averageRecentScore: 1,
        deltaToBaseline: -1,
        previousDecisions: ['worsened', 'worsened'],
      });
      const aboveMax = computeMasteryLevel({
        currentLevel: 100,
        currentDecision: 'improved',
        averageRecentScore: 5,
        deltaToBaseline: 1,
        previousDecisions: ['improved', 'improved'],
      });

      expect(belowMin).toBeGreaterThanOrEqual(0);
      expect(belowMin).toBeLessThanOrEqual(5);
      expect(aboveMax).toBeGreaterThanOrEqual(0);
      expect(aboveMax).toBeLessThanOrEqual(5);
    });

    it('steigt bei Verbesserung und sinkt bei Rückfall', () => {
      const increased = computeMasteryLevel({
        currentLevel: 2,
        currentDecision: 'improved',
        averageRecentScore: 4,
        deltaToBaseline: 0.6,
        previousDecisions: ['unchanged', 'improved'],
      });
      const decreased = computeMasteryLevel({
        currentLevel: 3,
        currentDecision: 'worsened',
        averageRecentScore: 2,
        deltaToBaseline: -0.7,
        previousDecisions: ['unchanged', 'worsened'],
      });

      expect(increased).toBeGreaterThan(2);
      expect(decreased).toBeLessThan(3);
    });
  });

  describe('E) Tutor-Understanding', () => {
    it('erlaubt sufficient als Abschluss-/Stabilisierungsübergang', () => {
      expect(
        applyFocusEvent('teilweise_stabilisiert', 'tutor_mark_sufficient', {
          reason: 'understanding_check:sufficient',
          source: 'tutor.service',
        }).nextStatus,
      ).toBe('stabil');

      expect(
        applyFocusEvent('in_training', 'tutor_mark_sufficient', {
          reason: 'understanding_check:sufficient',
          source: 'tutor.service',
        }).nextStatus,
      ).toBe('teilweise_stabilisiert');
    });

    it('hält partial im Lernzyklus', () => {
      expect(
        applyFocusEvent('teilweise_stabilisiert', 'tutor_mark_partial', {
          reason: 'understanding_check:partial',
          source: 'tutor.service',
        }).nextStatus,
      ).toBe('teilweise_stabilisiert');
    });

    it('setzt not_yet auf offenen Trainingsstatus', () => {
      expect(
        applyFocusEvent('stabil', 'tutor_mark_not_yet', {
          reason: 'understanding_check:not_yet',
          source: 'tutor.service',
        }).nextStatus,
      ).toBe('in_training');
    });
  });
});
