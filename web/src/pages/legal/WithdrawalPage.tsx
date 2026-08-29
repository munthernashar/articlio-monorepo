import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { LegalFact } from '@/pages/legal/LegalFact';
import { provider, LEGAL_VERSION } from '@/content/legal/provider';

/**
 * Widerrufsbelehrung für digitale Dienstleistungen, angelehnt an die
 * gesetzliche Muster-Widerrufsbelehrung (Anlage 1 zu Art. 246a §1 Abs. 2 EGBGB).
 *
 * Der Dienst startet auf ausdrücklichen Wunsch sofort. Das Widerrufsrecht
 * erlischt daher nach §356 Abs. 5 BGB – aber nur, wenn im Bezahlvorgang
 * BEIDE Erklärungen ausdrücklich eingeholt und dokumentiert werden:
 *   1. Zustimmung zum vorzeitigen Beginn der Leistung
 *   2. Kenntnisnahme des dadurch eintretenden Verlusts des Widerrufsrechts
 *
 * Fehlt eine davon, erlischt das Widerrufsrecht NICHT und der Nutzer kann
 * volle 14 Tage lang widerrufen. Siehe `WithdrawalConsent` im Checkout.
 */
export function WithdrawalPage() {
  return (
    <>
      <PublicNav />
      <main className="app-main page public-page legal-page">
        <header className="public-page-hero">
          <p className="public-kicker">Rechtliches</p>
          <h1>Widerrufsbelehrung</h1>
          <p>
            Fassung {LEGAL_VERSION.version}, gültig ab {LEGAL_VERSION.effectiveDate}. Gilt für
            Verbraucher im Sinne von §13 BGB.
          </p>
        </header>

        <article className="card public-card legal-card">
          <h2>Widerrufsrecht</h2>
          <p>
            Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
            widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.
          </p>
          <p>
            Um dein Widerrufsrecht auszuüben, musst du uns
          </p>
          <p className="legal-address">
            {provider.legalName}
            <br />
            <LegalFact value={provider.street} />
            <br />
            <LegalFact value={provider.city} />
            <br />
            {provider.country}
            <br />
            E-Mail: <LegalFact value={provider.email} />
          </p>
          <p>
            mittels einer eindeutigen Erklärung – zum Beispiel ein mit der Post versandter Brief
            oder eine E-Mail – über deinen Entschluss, diesen Vertrag zu widerrufen, informieren.
            Du kannst dafür das
            beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
          </p>
          <p>
            Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung
            des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.
          </p>

          <h2>Folgen des Widerrufs</h2>
          <p>
            Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir
            erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag
            zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses Vertrags bei uns
            eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du
            bei der ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde
            ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir wegen dieser
            Rückzahlung Entgelte berechnet.
          </p>
          <p>
            Hast du verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so
            hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem
            Zeitpunkt, zu dem du uns von der Ausübung des Widerrufsrechts hinsichtlich dieses
            Vertrags unterrichtest, bereits erbrachten Dienstleistungen im Vergleich zum
            Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.
          </p>

          <h2>Vorzeitiges Erlöschen des Widerrufsrechts</h2>
          <p>
            Dein Widerrufsrecht erlischt vorzeitig, wenn wir die Dienstleistung vollständig
            erbracht haben und mit der Ausführung erst begonnen haben, nachdem du
          </p>
          <ul>
            <li>dazu deine ausdrückliche Zustimmung gegeben hast und</li>
            <li>
              gleichzeitig deine Kenntnis davon bestätigt hast, dass du dein Widerrufsrecht bei
              vollständiger Vertragserfüllung durch uns verlierst.
            </li>
          </ul>
          <p>
            Beide Erklärungen holen wir im Bezahlvorgang ausdrücklich ein und dokumentieren sie.
            Ohne diese Erklärungen bleibt dein Widerrufsrecht die vollen vierzehn Tage bestehen.
          </p>

          <h2>Muster-Widerrufsformular</h2>
          <p className="legal-note">
            Wenn du den Vertrag widerrufen willst, fülle dieses Formular aus und sende es zurück.
          </p>
          <div className="legal-formular">
            <p>
              An {provider.legalName}, <LegalFact value={provider.street} />,{' '}
              <LegalFact value={provider.city} />, {provider.country}, E-Mail:{' '}
              <LegalFact value={provider.email} />
            </p>
            <p>
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den
              Kauf der folgenden Waren (*) / die Erbringung der folgenden Dienstleistung (*)
            </p>
            <p>Bestellt am (*) / erhalten am (*)</p>
            <p>Name des/der Verbraucher(s)</p>
            <p>Anschrift des/der Verbraucher(s)</p>
            <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</p>
            <p>Datum</p>
            <p className="legal-note">(*) Unzutreffendes streichen.</p>
          </div>
        </article>

        <LegalFooter />
      </main>
    </>
  );
}
