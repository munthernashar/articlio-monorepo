import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionProcessingStatus } from '@/features/sessions/SessionProcessingStatus';
import type { ConversationSession } from '@/types/domain';

function createSession(status: ConversationSession['status']): ConversationSession {
  return {
    id: 'session-1',
    title: 'Test',
    source: 'free_conversation',
    topic: 'Test',
    status,
    createdAt: '2026-05-01T10:00:00.000Z',
    transcriptStatus: 'pending',
    analysisStatus: 'pending',
  };
}

describe('SessionProcessingStatus', () => {
  it('zeigt Statusdarstellung für insufficient_data', () => {
    const html = renderToStaticMarkup(<SessionProcessingStatus session={createSession('insufficient_data')} />);

    expect(html).toContain('Zu wenig Sprache für eine Auswertung.');
    expect(html).toContain('Neue Session aufnehmen');
  });

  it('zeigt Statusdarstellung für completed_capped', () => {
    const html = renderToStaticMarkup(<SessionProcessingStatus session={createSession('completed_capped')} />);

    expect(html).toContain('Analyse fertig – bei sehr langen Aufnahmen werten wir nur einen Teil aus.');
    expect(html).toContain('wir haben trotzdem eine Analyse für dich erstellt');
  });

  it('zeigt Statusdarstellung für rejected_too_long', () => {
    const html = renderToStaticMarkup(<SessionProcessingStatus session={createSession('rejected_too_long')} />);

    expect(html).toContain('Die Aufnahme war zu lang, wir konnten sie nicht auswerten.');
    expect(html).toContain('Deine Aufnahme war zu lang für eine Auswertung');
  });

  // Bug (27.08.2026): die Schritt-Liste hing bis zum Terminalstatus komplett auf "pending",
  // weil sie session.processing?.transcriptStatus/analysisStatus las -- Felder, die
  // process-session/index.ts nie schreibt. Fix leitet den Zustand ausschließlich aus
  // session.status ab; diese Tests decken die beiden Zwischenzustände ab, bei denen der Bug
  // sichtbar war.
  it('markiert Upload und Transkript als erledigt, sobald status=transcribed erreicht ist', () => {
    const html = renderToStaticMarkup(<SessionProcessingStatus session={createSession('transcribed')} />);

    expect(html).toContain('Dein Feedback wird vorbereitet.');
    expect(html).toContain('85%');
    // Upload und Transkript sind fertig (✓), Analyse läuft aktiv (●).
    expect(html.match(/✓/g)?.length).toBe(2);
    expect(html).toContain('●');
  });

  it('zeigt "Wir erstellen gerade dein Transkript" während status=processing', () => {
    const html = renderToStaticMarkup(<SessionProcessingStatus session={createSession('processing')} />);

    expect(html).toContain('Wir erstellen gerade dein Transkript.');
    expect(html).toContain('60%');
  });
});
