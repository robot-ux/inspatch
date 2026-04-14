import type { ConnectionStatus } from '../hooks/useWebSocket';

interface HeaderBarProps {
  status: ConnectionStatus;
  onReconnect: () => void;
}

const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string; ringClass: string }> = {
  connected: {
    dotClass: 'bg-ip-success',
    label: 'Connected',
    ringClass: 'ring-ip-success/30',
  },
  reconnecting: {
    dotClass: 'bg-ip-warning animate-pulse',
    label: 'Reconnecting…',
    ringClass: 'ring-ip-warning/30',
  },
  disconnected: {
    dotClass: 'bg-ip-text-muted',
    label: 'Disconnected',
    ringClass: 'ring-ip-text-muted/20',
  },
};

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ip-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ip-gradient-start)" />
          <stop offset="1" stopColor="var(--ip-gradient-end)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ip-grad)" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="2.5" fill="url(#ip-grad)" />
      <line x1="12" y1="5" x2="12" y2="8.5" stroke="url(#ip-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="15.5" x2="12" y2="19" stroke="url(#ip-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="12" x2="8.5" y2="12" stroke="url(#ip-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15.5" y1="12" x2="19" y2="12" stroke="url(#ip-grad)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function HeaderBar({ status, onReconnect }: HeaderBarProps) {
  const cfg = statusConfig[status];
  const canReconnect = status !== 'connected';

  return (
    <div className="flex items-center justify-between px-3 h-11 border-b border-ip-border-subtle bg-ip-bg-secondary/50 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <LogoIcon />
        <span className="text-[13px] font-semibold tracking-wide text-transparent bg-clip-text bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end">
          inspatch
        </span>
      </div>
      <button
        onClick={canReconnect ? onReconnect : undefined}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-150 ${
          canReconnect
            ? 'hover:bg-ip-bg-tertiary active:scale-95'
            : ''
        }`}
        title={canReconnect ? 'Click to reconnect' : 'Server connected'}
      >
        <span className={`relative flex h-2 w-2`}>
          {status === 'connected' && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-ip-success opacity-40 animate-ping" />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dotClass}`} />
        </span>
        <span className="text-[11px] text-ip-text-muted">{cfg.label}</span>
      </button>
    </div>
  );
}
