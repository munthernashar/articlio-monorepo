/**
 * Zentrale Betreiberdaten für alle Rechtstexte.
 *
 * Einzige Quelle der Wahrheit für Impressum, Datenschutzerklärung, AGB und
 * Widerrufsbelehrung. Fehlende Angaben werden bewusst NICHT erfunden, sondern
 * als `missing()` markiert:
 *
 * - In der UI erscheinen sie als sichtbarer Hinweis statt als Falschangabe.
 * - `provider.test.ts` schlägt fehl, solange etwas fehlt.
 *
 * Damit kann die App nicht versehentlich mit Platzhaltern in Produktion gehen.
 * Wichtig: fehlende Angaben werden hier als `missing(...)` markiert, NICHT
 * aus dem Objekt entfernt — sonst bricht sowohl der TypeScript-Build (die
 * Seiten greifen auf feste Feldnamen zu) als auch die Absicherung, die genau
 * das verhindern soll.
 */

export type ProviderFact = string | MissingFact;

export type MissingFact = {
  readonly __missing: true;
  /** Was genau beschafft werden muss – erscheint im UI-Hinweis. */
  readonly label: string;
};

export function missing(label: string): MissingFact {
  return { __missing: true, label };
}

export function isMissing(fact: ProviderFact): fact is MissingFact {
  return typeof fact !== 'string';
}

/**
 * Betreiber im Sinne von §5 DDG.
 *
 * OpenBrain LLC ist eine US-Gesellschaft, die ihren Dienst gezielt an
 * Verbraucher in Deutschland richtet. Daraus folgen drei Besonderheiten,
 * die in den Texten abgebildet sind:
 *
 * 1. Impressumspflicht nach §5 DDG gilt trotz US-Sitz, weil der Dienst auf
 *    den deutschen Markt ausgerichtet ist.
 * 2. Ein EU-Vertreter nach Art. 27 DSGVO ist erforderlich, solange keine
 *    Ausnahme nach Art. 27 Abs. 2 DSGVO greift.
 * 3. Jede Verarbeitung ist ein Drittlandtransfer nach Art. 44 ff. DSGVO und
 *    braucht eine Transfergrundlage.
 */
export const provider = {
  legalName: 'OpenBrain LLC',
  legalForm: 'Limited Liability Company (LLC) nach dem Recht der Vereinigten Staaten von Amerika',
  productName: 'Articlio',

  /** Ladungsfähige Anschrift – ein Postfach genügt nach §5 DDG nicht. */
  street: '7901 4th St. N Ste 300',
  city: 'St. Petersburg, FL 33702',
  country: 'Vereinigte Staaten von Amerika',

  /** Gründungsstaat und File Number – das US-Pendant zu Register und Registernummer. */
  incorporationState: 'Florida',
  registrationNumber: missing('File Number / Entity Number des Gründungsstaats Florida'),

  /**
   * Vertretungsberechtigte Person nach §5 Abs. 1 Nr. 1 DDG.
   * ACHTUNG: "CEO" ist ein Titel, kein Name. §5 DDG verlangt den Namen der
   * natürlichen Person – ein Titel allein erfüllt die Pflichtangabe nicht.
   * Bitte den tatsächlichen Namen ergänzen (z. B. "Max Mustermann, CEO").
   */
  representative: missing('Name der vertretungsberechtigten Person (ein Titel wie "CEO" allein genügt §5 DDG nicht)'),

  /**
   * §5 Abs. 1 Nr. 2 DDG verlangt E-Mail plus einen zweiten Kontaktweg, über
   * den schnell und unmittelbar kommuniziert werden kann. Ein Telefon ist
   * dafür nicht zwingend: Der EuGH hat in C-649/17 (Bundesverband der
   * Verbraucherzentralen ./. Amazon) entschieden, dass eine schnelle
   * elektronische Kontaktmöglichkeit (z. B. E-Mail mit tatsächlich zeitnaher
   * Antwort) ausreicht. Diese Seite stützt sich bewusst darauf, statt ein
   * nicht vorhandenes Telefon als Platzhalter zu zeigen.
   */
  email: 'care@openbrainllc.com',
  supportEmail: 'care@openbrainllc.com',
  privacyEmail: 'care@openbrainllc.com',

  /**
   * Art. 27 DSGVO – Pflichtangabe für Verantwortliche ohne Niederlassung in
   * der EU. Der Vertreter MUSS in einem EU-Mitgliedstaat niedergelassen
   * sein (Art. 27 Abs. 3 DSGVO). Die bislang übermittelte Adresse liegt in
   * Florida/USA und erfüllt diese Voraussetzung nicht – deshalb bleibt die
   * Adresse als fehlend markiert, auch wenn Name und E-Mail vorliegen.
   */
  euRepresentativeName: 'Newman, Taylor',
  euRepresentativeAddress: missing(
    'Anschrift des EU-Vertreters in einem EU-Mitgliedstaat – die bisher übermittelte Adresse (Florida, USA) erfüllt Art. 27 Abs. 3 DSGVO nicht, da sie nicht in der EU liegt',
  ),
  euRepresentativeEmail: 'care@openbrainllc.com',

  /**
   * Art. 37 DSGVO verlangt einen Datenschutzbeauftragten nur unter
   * bestimmten Voraussetzungen (u. a. Kerntätigkeit mit umfangreicher,
   * systematischer Überwachung oder umfangreicher Verarbeitung besonderer
   * Kategorien). Annahme: OpenBrain LLC erfüllt diese Schwelle aktuell
   * nicht. Bitte bestätigen – falls doch ein DSB benannt ist oder die
   * Schwelle erreicht wird, hier den Namen/Kontakt eintragen.
   */
  dataProtectionOfficer:
    'Wir haben keinen Datenschutzbeauftragten benannt, da die gesetzlichen Voraussetzungen nach Art. 37 DSGVO derzeit nicht vorliegen.',

  /**
   * PAngV/USt: Für den Verkauf digitaler Dienstleistungen an Verbraucher in
   * der EU braucht ein US-Anbieter entweder eine Registrierung im
   * Nicht-EU-OSS-Verfahren oder Stripe Tax muss als "Merchant of Record"
   * konfiguriert sein, damit Stripe selbst als Verkäufer auftritt und die
   * Umsatzsteuer abführt. Ohne eines von beidem darf "inkl. MwSt." auf der
   * Preisseite nicht angezeigt werden. Dieses Feld bewusst nicht gelöscht,
   * bis der tatsächliche Status geklärt ist.
   */
  vatId: missing('USt-IdNr. bzw. Nicht-EU-OSS-Registrierungsnummer – oder Bestätigung, dass Stripe Tax als Merchant of Record die Steuerpflicht übernimmt'),
} as const satisfies Record<string, ProviderFact>;

export type Provider = typeof provider;

/** Alle Felder, die vor dem Produktivgang noch beschafft werden müssen. */
export function listMissingProviderFacts(): Array<{ field: string; label: string }> {
  return Object.entries(provider)
    .filter(([, value]) => isMissing(value as ProviderFact))
    .map(([field, value]) => ({ field, label: (value as MissingFact).label }));
}

/**
 * Stand der Rechtstexte. Bei inhaltlichen Änderungen mitpflegen – die AGB
 * verweisen darauf, und Nutzer müssen Änderungen zuordnen können.
 */
export const LEGAL_VERSION = {
  version: '1.0',
  effectiveDate: '2026-08-15',
} as const;
