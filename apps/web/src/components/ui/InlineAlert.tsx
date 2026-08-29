import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { ICON_SIZE_MD } from '@/lib/icon-sizes';

export type InlineAlertTone = 'danger' | 'warning' | 'info' | 'success';

const TONE_ICONS = {
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
} as const;

type InlineAlertProps = {
  tone: InlineAlertTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
};

export function InlineAlert({ tone, title, children, action }: InlineAlertProps) {
  const Icon = TONE_ICONS[tone];

  return (
    <div className={`inline-alert inline-alert--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden="true" size={ICON_SIZE_MD} className="inline-alert-icon" />
      <div className="inline-alert-body">
        {title ? <p className="inline-alert-title">{title}</p> : null}
        <p className="inline-alert-text">{children}</p>
        {action ? <div className="inline-alert-action">{action}</div> : null}
      </div>
    </div>
  );
}
