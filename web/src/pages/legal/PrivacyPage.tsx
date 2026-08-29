import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { LegalFact } from '@/pages/legal/LegalFact';
import { provider, LEGAL_VERSION } from '@/content/legal/provider';

/**
 * Datenschutzerklärung nach Art. 13 DSGVO.
 *
 * Die beschriebenen Verarbeitungen bilden die tatsächliche Verarbeitungskette
 * der Anwendung ab:
 *   Aufnahme  → Supabase Storage (Bucket `session-audio`)
 *   Transkript → OpenAI /audio/transcriptions
 *   Bereinigung + Analyse → zwei weitere OpenAI-Aufrufe
 *   Abrechnung → Stripe
 *   Auslieferung → Vercel
 *
 * Wird die Kette geändert, muss dieser Text mitgeändert werden.
 */
export function PrivacyPage() {
  return (
    <>
      <PublicNav />
      <main className="app-main page public-page legal-page">
        <header className="public-page-hero">
          <p className="public-kicker">Rechtliches</p>
          <h1>Datenschutzerklärung</h1>
          <p>
            Fassung {LEGAL_VERSION.version}, gültig ab {LEGAL_VERSION.effectiveDate}.
          </p>
        </header>

        <article className="card public-card legal-card">
          <h2>1. Verantwortlicher</h2>
          <p>
            Verantwortlich für die Verarbeitung personenbezogener Daten ist:
            <br />
            {provider.legalName}, <LegalFact value={provider.street} />,{' '}
            <LegalFact value={provider.city} />, {provider.country}
            <br />
            E-Mail: <LegalFact value={provider.privacyEmail} />
          </p>

          <h2>2. Vertreter in der Europäischen Union</h2>
          <p>
            Da wir unseren Sitz außerhalb der Europäischen Union haben, unseren Dienst aber gezielt
            an Nutzer in der EU richten, haben wir nach Art. 27 DSGVO einen Vertreter benannt. Du
            kannst dich in allen Datenschutzfragen wahlweise an uns oder an diesen Vertreter wenden:
            <br />
            <LegalFact value={provider.euRepresentativeName} />
            <br />
            <LegalFact value={provider.euRepresentativeAddress} />
            <br />
            E-Mail: <LegalFact value={provider.euRepresentativeEmail} />
          </p>

          <h2>3. Datenschutzbeauftragter</h2>
          <p>
            <LegalFact value={provider.dataProtectionOfficer} />
          </p>

          <h2>4. Welche Daten wir verarbeiten und wozu</h2>

          <h3>4.1 Konto und Profil</h3>
          <p>
            Bei der Registrierung verarbeiten wir deine E-Mail-Adresse und dein Passwort in
            gehashter Form. Im Profil kommen Anzeigename, Muttersprache, selbst eingeschätztes
            Sprachniveau und Zeitzone hinzu. Diese Daten brauchen wir, um dein Konto zu führen und
            die Lerninhalte auf dich zuzuschneiden.
          </p>
          <p className="legal-basis">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsvertrags).
          </p>

          <h3>4.2 Sprachaufnahmen</h3>
          <p>
            Kern des Dienstes ist die Analyse deiner gesprochenen Sprache. Wenn du eine Session
            aufnimmst, wird die Audiodatei in unserem Speicher abgelegt und anschließend
            automatisiert verarbeitet.
          </p>
          <p className="legal-note">
            Wichtig: Sprich in Sessions keine besonders sensiblen Informationen aus – etwa Angaben
            zu Gesundheit, Religion, politischer Überzeugung oder Daten Dritter. Da du frei
            sprichst, können wir den Inhalt nicht vorab filtern. Wir werten deine Stimme
            ausschließlich sprachlich aus und nutzen sie nicht zur biometrischen Identifizierung.
          </p>
          <p className="legal-basis">Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

          <h3>4.3 Transkription und Analyse durch KI</h3>
          <p>Deine Aufnahme durchläuft drei automatisierte Schritte:</p>
          <ol>
            <li>
              Die Audiodatei wird an OpenAI übermittelt und dort in Text umgewandelt
              (Spracherkennung).
            </li>
            <li>Der Rohtext wird durch ein Sprachmodell bereinigt und strukturiert.</li>
            <li>
              Der bereinigte Text wird durch ein Sprachmodell fachlich ausgewertet: Bewertung nach
              Sprachkategorien, Erkennung wiederkehrender Muster und Ableitung eines Lernfokus.
            </li>
          </ol>
          <p>
            Aus diesen Schritten entstehen Transkripte, Analysen, erkannte Sprachmuster,
            Fokusthemen und Fortschrittswerte, die wir deinem Konto zuordnen und dir im Dashboard
            anzeigen.
          </p>
          <p className="legal-basis">Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

          <h3>4.4 Zahlungsabwicklung</h3>
          <p>
            Für kostenpflichtige Pläne nutzen wir Stripe. Deine Zahlungsdaten – etwa
            Kreditkartennummer oder Bankverbindung – gibst du direkt bei Stripe ein; wir sehen und
            speichern sie nicht. Wir erhalten von Stripe die Information, welcher Plan gebucht ist,
            wie dein Zahlungsstatus lautet und wann Abrechnungszeiträume beginnen und enden.
          </p>
          <p className="legal-basis">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. c DSGVO
            (gesetzliche Aufbewahrungspflichten für Rechnungsunterlagen).
          </p>

          <h3>4.5 Server-Logs und Betriebssicherheit</h3>
          <p>
            Beim Aufruf der Anwendung fallen technische Zugriffsdaten an, insbesondere IP-Adresse,
            Zeitpunkt, aufgerufene Ressource und Browserkennung. Wir nutzen sie, um den Betrieb
            sicherzustellen, Störungen zu erkennen und Missbrauch abzuwehren.
          </p>
          <p className="legal-basis">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und
            stabilen Betrieb).
          </p>

          <h3>4.6 Reichweitenmessung und Nutzungsanalyse</h3>
          <p>
            Um zu verstehen, wie unser Angebot genutzt wird, messen wir anonymisierte
            Zugriffsstatistiken und einzelne Nutzungsschritte, etwa den Aufruf der Preisseite oder
            den Beginn einer Registrierung. Dabei speichern wir eine zufällig erzeugte Kennung in
            deinem Browser, damit zusammengehörige Schritte einander zugeordnet werden können.
          </p>
          <p>
            <strong>
              Diese Messung findet ausschließlich statt, wenn du eingewilligt hast.
            </strong>{' '}
            Ohne Einwilligung wird weder eine Kennung gespeichert noch ein Analysedienst geladen. Du
            kannst deine Entscheidung jederzeit über den Link „Cookie-Einstellungen“ am Seitenende
            ändern.
          </p>
          <p className="legal-basis">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO und §25 Abs. 1 TDDDG (Einwilligung).
          </p>

          <h2>5. Empfänger und Auftragsverarbeiter</h2>
          <p>
            Wir setzen sorgfältig ausgewählte Dienstleister ein, die Daten ausschließlich nach
            unseren Weisungen verarbeiten. Mit allen haben wir Verträge zur Auftragsverarbeitung
            nach Art. 28 DSGVO geschlossen.
          </p>
          <div className="legal-table-scroll">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Dienstleister</th>
                  <th>Zweck</th>
                  <th>Verarbeitete Daten</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase</td>
                  <td>Datenbank, Authentifizierung, Dateispeicher, serverseitige Funktionen</td>
                  <td>Konto-, Profil- und Lerndaten, Sprachaufnahmen, Transkripte</td>
                </tr>
                <tr>
                  <td>OpenAI</td>
                  <td>Spracherkennung und sprachliche Auswertung</td>
                  <td>Sprachaufnahmen, Transkripte</td>
                </tr>
                <tr>
                  <td>Stripe</td>
                  <td>Zahlungsabwicklung und Abonnementverwaltung</td>
                  <td>Zahlungs- und Abrechnungsdaten</td>
                </tr>
                <tr>
                  <td>Vercel</td>
                  <td>Auslieferung der Anwendung, Reichweitenmessung</td>
                  <td>Zugriffsdaten, Nutzungsstatistiken</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>6. Übermittlung in Drittländer</h2>
          <p>
            Wir haben unseren Sitz in den Vereinigten Staaten, ebenso einige unserer Dienstleister.
            Personenbezogene Daten werden daher in die USA übermittelt. Die USA sind ein Drittland
            im Sinne der DSGVO; ein Schutzniveau, das dem europäischen vollständig entspricht, ist
            dort nicht in jedem Fall gewährleistet. Insbesondere können US-Behörden unter
            bestimmten Voraussetzungen Zugriff auf Daten verlangen, ohne dass dir dieselben
            Rechtsbehelfe zur Verfügung stehen wie in der EU.
          </p>
          <p>
            Wir stützen die Übermittlung auf die Standardvertragsklauseln der Europäischen
            Kommission nach Art. 46 Abs. 2 lit. c DSGVO und – soweit der jeweilige Empfänger
            zertifiziert ist – auf den Angemessenheitsbeschluss zum EU-US Data Privacy Framework
            nach Art. 45 DSGVO. Ergänzend haben wir technische und organisatorische Maßnahmen
            getroffen, insbesondere Verschlüsselung bei Übertragung und Speicherung sowie
            Zugriffsbeschränkungen.
          </p>

          <h2>7. Speicherdauer</h2>
          <ul>
            <li>
              Konto-, Profil- und Lerndaten speichern wir, solange dein Konto besteht. Löschst du
              dein Konto, entfernen wir sie innerhalb von 30 Tagen.
            </li>
            <li>
              Sprachaufnahmen speichern wir, damit du Sessions erneut anhören und auswerten lassen
              kannst. Du kannst einzelne Aufnahmen jederzeit selbst löschen; mit dem Konto werden
              sie vollständig gelöscht.
            </li>
            <li>
              Abrechnungsunterlagen bewahren wir für die Dauer der gesetzlichen
              Aufbewahrungsfristen auf, insbesondere aus steuerrechtlichen Gründen. Sie sind für
              die weitere Nutzung gesperrt.
            </li>
            <li>Technische Zugriffsdaten löschen wir nach spätestens 30 Tagen.</li>
            <li>
              Analysedaten aus der Reichweitenmessung löschen wir spätestens nach 14 Monaten oder
              sobald du deine Einwilligung widerrufst.
            </li>
          </ul>

          <h2>8. Deine Rechte</h2>
          <p>Dir stehen gegenüber uns folgende Rechte zu:</p>
          <ul>
            <li>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO)</li>
            <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
            <li>Löschung (Art. 17 DSGVO)</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Datenübertragbarkeit in einem gängigen Format (Art. 20 DSGVO)</li>
            <li>
              Widerspruch gegen Verarbeitungen, die wir auf ein berechtigtes Interesse stützen
              (Art. 21 DSGVO)
            </li>
            <li>
              Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)
            </li>
          </ul>
          <p>
            Auskunft, Export und Löschung kannst du direkt in deinem Profil auslösen. Alternativ
            genügt eine Nachricht an <LegalFact value={provider.privacyEmail} />.
          </p>

          <h2>9. Beschwerderecht</h2>
          <p>
            Wenn du der Ansicht bist, dass wir deine Daten nicht rechtmäßig verarbeiten, kannst du
            dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Zuständig ist
            die Behörde deines gewöhnlichen Aufenthaltsorts, deines Arbeitsplatzes oder des Orts
            des mutmaßlichen Verstoßes.
          </p>

          <h2>10. Keine automatisierte Entscheidung mit Rechtswirkung</h2>
          <p>
            Die Auswertung deiner Sessions erfolgt automatisiert und mündet in Bewertungen,
            Fortschrittswerte und Lernempfehlungen. Diese Ergebnisse dienen ausschließlich deinem
            Lernfortschritt. Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO, die dir
            gegenüber rechtliche Wirkung entfaltet oder dich in ähnlicher Weise erheblich
            beeinträchtigt, findet nicht statt.
          </p>

          <h2>11. Pflicht zur Bereitstellung</h2>
          <p>
            Die Angabe deiner E-Mail-Adresse und eines Passworts ist erforderlich, um ein Konto
            anzulegen. Ohne Sprachaufnahmen kann der Dienst seinen Zweck nicht erfüllen. Alle
            übrigen Angaben sind freiwillig.
          </p>

          <h2>12. Änderungen dieser Erklärung</h2>
          <p>
            Wir passen diese Erklärung an, wenn sich unsere Verarbeitungen oder die Rechtslage
            ändern. Die jeweils gültige Fassung findest du stets auf dieser Seite; Fassung und
            Gültigkeitsdatum stehen oben.
          </p>
        </article>

        <LegalFooter />
      </main>
    </>
  );
}
