import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type BadgeProps = {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
};

export function Badge({ tone = 'neutral', icon: Icon, children, title }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {Icon ? <Icon aria-hidden="true" size={ICON_SIZE_SM} className="badge-icon" /> : null}
      {children}
    </span>
  );
}
