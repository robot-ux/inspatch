import type { ConnectionStatus } from '../hooks/useWebSocket';

interface HeaderBarProps {
  status: ConnectionStatus;
  onReconnect: () => void;
}

const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string }> = {
  connected: { dotClass: 'bg-ip-success animate-status-dot', label: 'Connected' },
  reconnecting: { dotClass: 'bg-ip-warning animate-pulse', label: 'Reconnecting...' },
  disconnected: { dotClass: 'bg-ip-text-muted', label: 'Disconnected' },
};

export function HeaderBar({ status, onReconnect }: HeaderBarProps) {
  return (
    <div className="flex items-center justify-between px-3 h-10 border-b border-ip-border-subtle">
      <span className="text-[13px] font-semibold text-transparent bg-clip-text bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end">
        inspatch
      </span>
      <button
        onClick={status !== 'connected' ? onReconnect : undefined}
        className={`flex items-center gap-2 ${status !== 'connected' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        title={status !== 'connected' ? 'Click to reconnect' : ''}
      >
        <div className={`w-2 h-2 rounded-full ${statusConfig[status].dotClass}`} />
        <span className="text-[11px] text-ip-text-secondary">{statusConfig[status].label}</span>
      </button>
    </div>
  );
}
