import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { LegalFact } from '@/pages/legal/LegalFact';
import { provider, LEGAL_VERSION } from '@/content/legal/provider';

/**
 * Allgemeine Geschäftsbedingungen für Verbraucher.
 *
 * Das Angebot richtet sich ausschließlich an Verbraucher im Sinne von §13 BGB.
 * Daraus folgt: Preise zwingend inklusive Umsatzsteuer, Widerrufsrecht,
 * kein abweichender Gerichtsstand, kein Ausschluss zwingenden Verbraucherrechts.
 */
export function TermsPage() {
  return (
    <>
      <PublicNav />
      <main className="app-main page public-page legal-page">
        <header className="public-page-hero">
          <p className="public-kicker">Rechtliches</p>
          <h1>Allgemeine Geschäftsbedingungen</h1>
          <p>
            Fassung {LEGAL_VERSION.version}, gültig ab {LEGAL_VERSION.effectiveDate}.
          </p>
        </header>

        <article className="card public-card legal-card">
          <h2>§1 Anbieter und Geltungsbereich</h2>
          <p>
            Diese Bedingungen gelten für alle Verträge über die Nutzung von {provider.productName}{' '}
            zwischen {provider.legalName}, <LegalFact value={provider.street} />,{' '}
            <LegalFact value={provider.city} />, {provider.country} („wir“) und dir als Nutzer.
          </p>
          <p>
            Unser Angebot richtet sich ausschließlich an Verbraucher im Sinne von §13 BGB, also an
            natürliche Personen, die den Vertrag zu Zwecken schließen, die überwiegend weder ihrer
            gewerblichen noch ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.
          </p>
          <p>Vertragssprache ist Deutsch.</p>

          <h2>§2 Leistungsbeschreibung</h2>
          <p>
            {provider.productName} ist ein digitaler Sprachlerndienst. Du nimmst gesprochene
            Übungssessions auf; diese werden automatisiert in Text umgewandelt und mithilfe von
            KI-Systemen sprachlich ausgewertet. Du erhältst Rückmeldungen zu deinem Ausdruck,
            erkannte Sprachmuster, einen Lernfokus und Empfehlungen für die nächsten Schritte.
          </p>
          <p>
            Der konkrete Leistungsumfang – insbesondere die Anzahl der Sessions pro Tag und die
            maximale Aufnahmedauer – ergibt sich aus dem von dir gebuchten Plan. Die jeweils
            gültigen Angaben findest du auf der <Link to={paths.public.pricing}>Preisseite</Link>.
          </p>
          <p>
            Die Auswertung erfolgt maschinell. Sie ersetzt keinen Sprachunterricht und keine
            Sprachprüfung. Wir schulden eine sorgfältig erbrachte Analyseleistung, aber keinen
            bestimmten Lernerfolg und keine fehlerfreie Bewertung im Einzelfall.
          </p>

          <h2>§3 Registrierung und Vertragsschluss</h2>
          <p>
            Für die Nutzung musst du ein Konto anlegen. Du bist verpflichtet, wahrheitsgemäße
            Angaben zu machen und dein Passwort geheim zu halten. Ein Konto darf nur von der Person
            genutzt werden, für die es angelegt wurde.
          </p>
          <p>
            Die Darstellung der Pläne auf unserer Website ist noch kein bindendes Angebot. Indem du
            im Bezahlvorgang die kostenpflichtige Bestellung abschickst, gibst du ein verbindliches
            Angebot ab. Der Vertrag kommt zustande, wenn wir die Buchung bestätigen oder den Zugang
            freischalten.
          </p>

          <h2>§4 Preise und Umsatzsteuer</h2>
          <p>
            Alle auf unserer Website angegebenen Preise sind Endpreise in Euro und enthalten die
            gesetzliche deutsche Umsatzsteuer in Höhe von derzeit 19 %. Zusätzliche Kosten fallen
            nicht an.
          </p>
          <p>
            Ändert sich der gesetzliche Umsatzsteuersatz, ändert sich der Bruttopreis
            entsprechend. Über sonstige Preisänderungen informieren wir dich mindestens sechs
            Wochen vor Wirksamkeit in Textform. Du kannst den Vertrag in diesem Fall bis zum
            Wirksamwerden der Änderung kündigen; widersprichst du nicht und kündigst du nicht, gilt
            die Änderung als angenommen. Auf dieses Recht weisen wir dich in der Mitteilung
            gesondert hin.
          </p>

          <h2>§5 Zahlung</h2>
          <p>
            Die Zahlung wickeln wir über den Zahlungsdienstleister Stripe ab. Es gelten die dort
            angebotenen Zahlungsarten. Das Entgelt ist im Voraus für den jeweiligen
            Abrechnungszeitraum fällig.
          </p>
          <p>
            Kommst du mit der Zahlung in Verzug, dürfen wir den Zugang nach vorheriger Ankündigung
            vorübergehend sperren, bis der offene Betrag ausgeglichen ist. Deine Daten bleiben
            währenddessen erhalten.
          </p>

          <h2>§6 Laufzeit und Kündigung</h2>
          <p>
            Das Abonnement läuft für den bei der Buchung angegebenen Zeitraum und verlängert sich
            danach automatisch auf unbestimmte Zeit, sofern du nicht kündigst. Nach der
            Verlängerung kannst du jederzeit mit einer Frist von einem Monat kündigen.
          </p>
          <p>
            Die Kündigung ist jederzeit ohne Angabe von Gründen möglich. Du kannst sie unmittelbar
            in der Anwendung über die Schaltfläche „Abo kündigen“ im Bereich Abrechnung erklären.
            Alternativ genügt eine Nachricht an <LegalFact value={provider.supportEmail} />.
          </p>
          <p>
            Das Recht beider Seiten zur Kündigung aus wichtigem Grund bleibt unberührt. Ein
            wichtiger Grund liegt für uns insbesondere vor, wenn du wiederholt und trotz Hinweises
            gegen §7 verstößt.
          </p>

          <h2>§7 Deine Pflichten</h2>
          <p>Bei der Nutzung von {provider.productName} verpflichtest du dich,</p>
          <ul>
            <li>keine rechtswidrigen, beleidigenden oder rechteverletzenden Inhalte aufzunehmen,</li>
            <li>
              keine Aufnahmen anderer Personen ohne deren Einwilligung hochzuladen – du bist für
              die Rechtmäßigkeit deiner Aufnahmen verantwortlich,
            </li>
            <li>
              den Dienst nicht automatisiert, in missbräuchlichem Umfang oder unter Umgehung
              technischer Beschränkungen zu nutzen,
            </li>
            <li>deine Zugangsdaten nicht weiterzugeben.</li>
          </ul>

          <h2>§8 Rechte an Inhalten</h2>
          <p>
            Deine Aufnahmen und die daraus entstehenden Transkripte und Auswertungen bleiben
            deine. Du räumst uns lediglich das Recht ein, sie zu speichern und zu verarbeiten,
            soweit das zur Erbringung der Leistung erforderlich ist. Zu welchem Zweck das im
            Einzelnen geschieht, beschreibt die{' '}
            <Link to={paths.legal.privacy}>Datenschutzerklärung</Link>.
          </p>
          <p>
            Wir verwenden deine Aufnahmen nicht zum Training eigener KI-Modelle und geben sie nicht
            zu diesem Zweck an Dritte weiter.
          </p>

          <h2>§9 Verfügbarkeit</h2>
          <p>
            Wir bemühen uns um eine hohe Verfügbarkeit, schulden aber keine ununterbrochene
            Erreichbarkeit. Wartungsarbeiten, Störungen bei Vorleistern und Ereignisse außerhalb
            unseres Einflussbereichs können zu vorübergehenden Einschränkungen führen. Geplante
            Wartungen kündigen wir nach Möglichkeit vorher an.
          </p>

          <h2>§10 Gewährleistung und Haftung</h2>
          <p>Es gelten die gesetzlichen Regelungen. Ergänzend gilt:</p>
          <p>
            Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben,
            Körper oder Gesundheit, nach dem Produkthaftungsgesetz und im Umfang einer von uns
            übernommenen Garantie.
          </p>
          <p>
            Bei leicht fahrlässiger Verletzung einer Pflicht, deren Erfüllung die ordnungsgemäße
            Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung du
            regelmäßig vertrauen darfst, haften wir der Höhe nach begrenzt auf den bei
            Vertragsschluss vorhersehbaren, vertragstypischen Schaden. Im Übrigen ist unsere Haftung
            bei leichter Fahrlässigkeit ausgeschlossen.
          </p>

          <h2>§11 Widerrufsrecht</h2>
          <p>
            Als Verbraucher steht dir ein gesetzliches Widerrufsrecht zu. Die Einzelheiten und die
            Voraussetzungen, unter denen dieses Recht vorzeitig erlischt, findest du in der{' '}
            <Link to={paths.legal.withdrawal}>Widerrufsbelehrung</Link>.
          </p>

          <h2>§12 Änderungen dieser Bedingungen</h2>
          <p>
            Wir können diese Bedingungen ändern, wenn dies wegen einer Änderung der Rechtslage,
            höchstrichterlicher Rechtsprechung oder des Leistungsumfangs erforderlich wird und dich
            nicht unangemessen benachteiligt. Wir informieren dich mindestens sechs Wochen vor
            Wirksamkeit in Textform. Widersprichst du nicht bis zum Wirksamwerden, gelten die
            Änderungen als angenommen; auf diese Folge weisen wir dich in der Mitteilung gesondert
            hin. Widersprichst du, können wir den Vertrag zum Zeitpunkt des Wirksamwerdens
            kündigen.
          </p>

          <h2>§13 Anwendbares Recht und Gerichtsstand</h2>
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.
            Zwingende verbraucherschützende Vorschriften des Staates, in dem du deinen gewöhnlichen
            Aufenthalt hast, bleiben davon unberührt (Art. 6 Rom-I-Verordnung).
          </p>
          <p>
            Für Klagen gegen uns steht dir neben dem Gericht an unserem Sitz auch das Gericht an
            deinem Wohnsitz offen. Ein abweichender Gerichtsstand wird nicht vereinbart.
          </p>

          <h2>§14 Streitbeilegung</h2>
          <p>
            Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>

          <h2>§15 Schlussbestimmungen</h2>
          <p>
            Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleibt die Wirksamkeit der
            übrigen Bestimmungen unberührt. An die Stelle der unwirksamen Bestimmung tritt die
            gesetzliche Regelung.
          </p>
        </article>

        <LegalFooter />
      </main>
    </>
  );
}
