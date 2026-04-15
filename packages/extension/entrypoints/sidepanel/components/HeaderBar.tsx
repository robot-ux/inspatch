import type { ConnectionStatus } from '../hooks/useWebSocket';
import { CrosshairIcon, InspatchLogoIcon, StopSquareIcon } from './icons';

export type EditorChoice = 'cursor' | 'vscode';

interface HeaderBarProps {
  status: ConnectionStatus;
  editor: EditorChoice;
  onReconnect: () => void;
  onEditorChange: (editor: EditorChoice) => void;
  compact?: boolean;
  isInspecting?: boolean;
  inspectDisabled?: boolean;
  onInspect?: () => void;
}

const statusConfig: Record<
  ConnectionStatus,
  { dotClass: string; label: string }
> = {
  connected: { dotClass: 'bg-ip-success', label: 'Connected' },
  reconnecting: {
    dotClass: 'bg-ip-warning animate-pulse',
    label: 'Reconnecting…',
  },
  disconnected: { dotClass: 'bg-ip-text-muted', label: 'Disconnected' },
};

export function HeaderBar({
  status,
  editor,
  onReconnect,
  onEditorChange,
  compact = false,
  isInspecting = false,
  inspectDisabled = false,
  onInspect,
}: HeaderBarProps) {
  const cfg = statusConfig[status];
  const canReconnect = status !== 'connected';

  return (
    <div className="flex items-center px-3 h-10 gap-2 border-b border-ip-border-subtle bg-ip-bg-secondary/50 backdrop-blur-sm">
      {/* Left: editor selector */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[10px] text-ip-text-muted">Editor</span>
        <select
          value={editor}
          onChange={(e) => onEditorChange(e.target.value as EditorChoice)}
          className="text-[10px] font-code text-ip-text-secondary bg-transparent border border-ip-border-subtle rounded px-1.5 py-0.5 hover:border-ip-border-accent focus:outline-none focus:border-ip-border-accent transition-colors cursor-pointer"
        >
          <option value="cursor">Cursor</option>
          <option value="vscode">VS Code</option>
        </select>
      </div>

      <div className="w-px h-3.5 bg-ip-border-subtle flex-shrink-0" />

      {/* Inspect toggle — only in compact mode */}
      {compact && (
        <>
          <div className="w-px h-3.5 bg-ip-border-subtle flex-shrink-0" />
          <button
            onClick={onInspect}
            disabled={inspectDisabled && !isInspecting}
            title={isInspecting ? 'Stop inspecting' : 'Start inspect'}
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[var(--ip-radius-sm)] text-[11px] font-medium transition-all duration-150 flex-shrink-0 ${
              isInspecting
                ? 'text-ip-error bg-ip-error/10 hover:bg-ip-error/20 animate-glow-pulse'
                : inspectDisabled
                  ? 'text-ip-text-muted opacity-40 cursor-not-allowed bg-ip-bg-tertiary/60'
                  : 'text-white bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 active:scale-95 shadow-ip-card'
            }`}
          >
            {isInspecting ? (
              <>
                <StopSquareIcon className="w-3 h-3" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <InspatchLogoIcon className="w-4 h-4" />
                <span>Inspect</span>
              </>
            )}
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* Right: connection status */}
      <button
        onClick={canReconnect ? onReconnect : undefined}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-150 flex-shrink-0 ${
          canReconnect ? 'hover:bg-ip-bg-tertiary active:scale-95' : ''
        }`}
        title={canReconnect ? 'Click to reconnect' : 'Server connected'}
      >
        <span className="relative flex h-2 w-2">
          {status === 'connected' && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-ip-success opacity-40 animate-ping" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dotClass}`}
          />
        </span>
        <span className="text-[11px] text-ip-text-muted">{cfg.label}</span>
      </button>
    </div>
  );
}
