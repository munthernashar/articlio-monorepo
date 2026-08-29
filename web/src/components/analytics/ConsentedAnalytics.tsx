import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { consentService } from '@/services/consent/consent.service';

/**
 * Lädt Vercel Analytics und Speed Insights ausschließlich nach erteilter
 * Einwilligung. Vorher wird kein Skript geladen und kein Request abgesetzt.
 */
export function ConsentedAnalytics() {
  const [isAllowed, setIsAllowed] = useState(() => consentService.isAnalyticsAllowed());

  useEffect(() => consentService.subscribe((state) => setIsAllowed(state === 'granted')), []);

  if (!isAllowed) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
