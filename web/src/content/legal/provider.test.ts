import { describe, expect, it } from 'vitest';
import { listMissingProviderFacts } from '@/content/legal/provider';

/**
 * Vor einem Produktivgang müssen alle Pflichtangaben nach §5 DDG, Art. 13 und
 * Art. 27 DSGVO vorliegen. Solange `provider.ts` `missing(...)`-Platzhalter
 * enthält, MUSS dieser Test rot bleiben — er ist die Absicherung dagegen,
 * dass die App versehentlich mit unvollständigen Rechtstexten live geht.
 *
 * Fehlt dieser Test rot: die fehlenden Angaben in src/content/legal/provider.ts
 * beschaffen und dort eintragen, nicht diesen Test anpassen oder löschen.
 */
describe('Betreiberdaten für Rechtstexte', () => {
  it('sind vollständig beschafft, bevor die App produktiv geht', () => {
    const missingFacts = listMissingProviderFacts();

    if (missingFacts.length > 0) {
      const summary = missingFacts.map((fact) => `- ${fact.field}: ${fact.label}`).join('\n');
      throw new Error(
        `${missingFacts.length} Betreiberangabe(n) fehlen noch für Impressum/Datenschutz/AGB/Widerruf:\n${summary}`,
      );
    }

    expect(missingFacts).toHaveLength(0);
  });
});
