import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Smartphone, WifiOff } from 'lucide-react';
import './ScreenStatus.css';

export type ScreenStatusKind = 'empty' | 'error' | 'offline' | 'forbidden' | 'loading';

interface ScreenStatusProps {
  kind: ScreenStatusKind;
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

const defaultIcons: Record<ScreenStatusKind, ReactNode> = {
  empty: <Smartphone size={48} aria-hidden="true" />,
  error: <AlertTriangle size={48} aria-hidden="true" />,
  offline: <WifiOff size={48} aria-hidden="true" />,
  forbidden: <AlertTriangle size={48} aria-hidden="true" />,
  loading: <Loader2 className="animate-spin" size={32} aria-hidden="true" />,
};

export function ScreenStatus({ kind, title, description, action, icon }: ScreenStatusProps) {
  return (
    <div className={`screen-status screen-status--${kind}`} role={kind === 'error' || kind === 'offline' ? 'alert' : 'status'}>
      <div className="screen-status__icon">{icon ?? defaultIcons[kind]}</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="screen-status__action">{action}</div>}
    </div>
  );
}
