import { StopIcon } from "./icons";
import { InspatchMark } from "./InspatchWordmark";

interface HeaderBarProps {
  /**
   * When true, the current tab is unsupported (not localhost, not file://).
   * Header shows a "Not available here" chip; no inspect toggle.
   */
  notApplicable?: boolean;
  showInspectToggle?: boolean;
  inspecting?: boolean;
  inspectDisabled?: boolean;
  currentTabUrl?: string;
  onInspect?: () => void;
}

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

/**
 * Header is visually independent from the WebSocket connection state.
 * The chip on the right only carries tab-level info (host / not-applicable),
 * which changes only when the user switches tabs. All server-state feedback
 * lives in the page body (StatusGuide / inline disconnected notice).
 */
export function HeaderBar({
  notApplicable = false,
  showInspectToggle = false,
  inspecting = false,
  inspectDisabled = false,
  currentTabUrl,
  onInspect,
}: HeaderBarProps) {
  const host = notApplicable ? undefined : formatHost(currentTabUrl);

  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-ip-border-subtle bg-ip-bg-secondary/50 px-3 backdrop-blur-sm">
      {showInspectToggle && !notApplicable ? (
        <InspectToggle
          inspecting={inspecting}
          disabled={inspectDisabled}
          onClick={onInspect}
        />
      ) : (
        <span className="text-[11px] font-semibold tracking-tight text-ip-text-primary">Inspatch</span>
      )}

      <div className="flex-1" />

      {notApplicable ? (
        <TabInfoChip tone="warning" label="Not available here" title="This tab type isn't supported by Inspatch" />
      ) : host ? (
        <span className="max-w-[180px] truncate font-code text-[11px] text-ip-text-muted" title={host}>
          {host}
        </span>
      ) : null}
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
        "inline-flex h-7 items-center gap-1 rounded-ip-sm px-2.5 text-[11px] font-medium transition-all duration-150",
        inspecting
          ? "animate-glow-error bg-ip-error-muted text-ip-error hover:brightness-110"
          : disabled
            ? "cursor-not-allowed bg-ip-bg-tertiary/60 text-ip-text-muted opacity-50"
            : "bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end text-white shadow-ip-card hover:brightness-110 active:scale-95",
      ].join(" ")}
    >
      {inspecting ? <StopIcon size={11} /> : <InspatchMark size={12} />}
      <span>{inspecting ? "Stop inspect" : "Inspect"}</span>
    </button>
  );
}

interface TabInfoChipProps {
  tone: "warning";
  label: string;
  title: string;
}

function TabInfoChip({ tone, label, title }: TabInfoChipProps) {
  const dot = tone === "warning" ? "bg-ip-warning" : "bg-ip-text-muted/60";
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" title={title}>
      <span className={`inline-flex h-2 w-2 rounded-full ${dot}`} />
      <span className="text-[11px] text-ip-text-muted">{label}</span>
    </div>
  );
}
