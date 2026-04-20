import type { ConnectionStatus } from "../hooks/useWebSocket";
import { StopIcon } from "./icons";
import { InspatchMark } from "./InspatchWordmark";

type ChipVariant = ConnectionStatus | "not-applicable";

interface HeaderBarProps {
  status: ConnectionStatus;
  notApplicable?: boolean;
  showInspectToggle?: boolean;
  inspecting?: boolean;
  inspectDisabled?: boolean;
  currentTabUrl?: string;
  onInspect?: () => void;
  onReconnect: () => void;
}

const CHIP_COPY: Record<ChipVariant, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
  "not-applicable": "—",
};

function formatHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "local file";
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return undefined;
  }
}

export function HeaderBar({
  status,
  notApplicable = false,
  showInspectToggle = false,
  inspecting = false,
  inspectDisabled = false,
  currentTabUrl,
  onInspect,
  onReconnect,
}: HeaderBarProps) {
  const variant: ChipVariant = notApplicable ? "not-applicable" : status;
  const canReconnect = !notApplicable && status !== "connected";
  const host = status === "connected" && !notApplicable ? formatHost(currentTabUrl) : undefined;

  return (
    <header className="flex h-10 flex-none items-center gap-2 border-b border-ip-border-subtle bg-ip-bg-secondary/50 px-3 backdrop-blur-sm">
      {showInspectToggle && !notApplicable ? (
        <InspectToggle
          inspecting={inspecting}
          disabled={inspectDisabled}
          onClick={onInspect}
        />
      ) : (
        <span className="text-[12px] font-semibold tracking-tight text-ip-text-primary">Inspatch</span>
      )}

      <div className="flex-1" />

      <ConnectionChip variant={variant} host={host} canReconnect={canReconnect} onClick={onReconnect} />
    </header>
  );
}

interface InspectToggleProps {
  inspecting: boolean;
  disabled: boolean;
  onClick?: () => void;
}

function InspectToggle({ inspecting, disabled, onClick }: InspectToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !inspecting}
      aria-pressed={inspecting}
      title={inspecting ? "Stop inspecting" : "Start inspect"}
      className={[
        "inline-flex h-8 items-center gap-1.5 rounded-ip-sm px-3 text-[12px] font-medium transition-all duration-150",
        inspecting
          ? "animate-glow-error bg-ip-error-muted text-ip-error hover:brightness-110"
          : disabled
            ? "cursor-not-allowed bg-ip-bg-tertiary/60 text-ip-text-muted opacity-50"
            : "bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end text-white shadow-ip-card hover:brightness-110 active:scale-95",
      ].join(" ")}
    >
      {inspecting ? <StopIcon size={12} /> : <InspatchMark size={13} />}
      <span>{inspecting ? "Stop inspect" : "Inspect"}</span>
    </button>
  );
}

interface ConnectionChipProps {
  variant: ChipVariant;
  host?: string;
  canReconnect: boolean;
  onClick: () => void;
}

function ConnectionChip({ variant, host, canReconnect, onClick }: ConnectionChipProps) {
  const dot =
    variant === "connected"
      ? "bg-ip-success"
      : variant === "reconnecting"
        ? "bg-ip-warning"
        : variant === "disconnected"
          ? "bg-ip-error"
          : "bg-ip-text-muted";

  const body = (
    <>
      <span className="relative flex h-2 w-2">
        {variant === "connected" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ip-success opacity-40" />
        )}
        {variant === "reconnecting" && (
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-ip-warning opacity-60" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className="text-[11px] text-ip-text-muted">{CHIP_COPY[variant]}</span>
      {host && (
        <>
          <span className="text-[11px] text-ip-text-muted/50">·</span>
          <span className="max-w-[140px] truncate font-code text-[11px] text-ip-text-secondary" title={host}>
            {host}
          </span>
        </>
      )}
    </>
  );

  if (canReconnect) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Click to reconnect"
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-150 hover:bg-ip-bg-tertiary active:scale-95"
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
      title={variant === "connected" ? "Server connected" : "Not applicable on this tab"}
    >
      {body}
    </div>
  );
}
