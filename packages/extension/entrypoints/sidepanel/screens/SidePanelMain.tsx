import type { ChangeMode, ConsoleError, ElementSelection } from "@inspatch/shared";
import { SERVER_ENDPOINT_DISPLAY } from "../config";
import type { ConnectionStatus } from "../hooks/useWebSocket";
import type { ConversationEntry } from "../hooks/useTabSessions";
import { ChangeInput } from "../components/ChangeInput";
import { ConsoleErrorTray } from "../components/ConsoleErrorTray";
import { ConversationList } from "../components/ConversationList";
import { ElementCard } from "../components/ElementCard";
import { EmptyState } from "../components/EmptyState";
import { FileUrlPermissionBanner } from "../components/FileUrlPermissionBanner";
import { FooterMeta } from "../components/FooterMeta";
import { HeaderBar } from "../components/HeaderBar";
import { PlusIcon } from "../components/icons";
import { OnboardingSteps } from "../components/OnboardingSteps";
import { StatusGuide } from "../components/StatusGuide";
import { resolveTargetedNode } from "../utils/tree";

type InspectState = "idle" | "inspecting";

interface SidePanelMainProps {
  connectionStatus: ConnectionStatus;
  onReconnect: () => void;

  inspectState: InspectState;
  hasUsedInspect: boolean;
  selectedElement: ElementSelection | null;
  targetedXpath: string | null;
  history: ConversationEntry[];
  activeRequestId: string | null;
  consoleErrors: ConsoleError[];
  transientError: string | null;
  showFileUrlBanner: boolean;
  extensionId: string;
  currentTabUrl?: string;

  onStartInspect: () => void;
  onStopInspect: () => void;
  onClear: () => void;
  onElementHover: () => void;
  onElementLeave: () => void;
  onRetargetHover: (xpath: string) => void;
  onRetargetLeave: () => void;
  onTargetRow: (xpath: string) => void;
  onSendChange: (description: string, imageDataUrl?: string, mode?: ChangeMode) => void;
  onApprovePlan: () => void;
  onCancelPlan: () => void;
  onNewConversation: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

export function SidePanelMain(props: SidePanelMainProps) {
  const {
    connectionStatus,
    onReconnect,
    inspectState,
    hasUsedInspect,
    selectedElement,
    targetedXpath,
    history,
    activeRequestId,
    consoleErrors,
    transientError,
    showFileUrlBanner,
    extensionId,
    currentTabUrl,
    onStartInspect,
    onStopInspect,
    onClear,
    onElementHover,
    onElementLeave,
    onRetargetHover,
    onRetargetLeave,
    onTargetRow,
    onSendChange,
    onApprovePlan,
    onCancelPlan,
    onNewConversation,
    onOpenSource,
  } = props;

  const inspecting = inspectState === "inspecting";
  const showCompactToggle = hasUsedInspect || !!selectedElement || inspecting;
  const disconnected = connectionStatus !== "connected";
  const elementVisible = !!selectedElement && !inspecting;
  const targetedNode = selectedElement
    ? resolveTargetedNode(selectedElement, targetedXpath)
    : null;
  const targetHasSource = !!targetedNode?.sourceFile;
  // On file:// pages without "Allow access to file URLs", the content script
  // can't be injected so Inspect would always fail — block it at the source.
  const inspectBlocked = disconnected || showFileUrlBanner;

  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const hasPendingPlan = !!latestEntry?.pendingPlan;
  const turnInFlight =
    activeRequestId !== null &&
    latestEntry?.requestId === activeRequestId &&
    !latestEntry.changeResult;
  const trayVisible =
    elementVisible && consoleErrors.length > 0 && history.length === 0;

  return (
    <div className="flex h-screen flex-col bg-ip-bg-primary">
      <HeaderBar
        showInspectToggle={showCompactToggle}
        inspecting={inspecting}
        inspectDisabled={inspectBlocked}
        currentTabUrl={currentTabUrl}
        onInspect={inspecting ? onStopInspect : onStartInspect}
      />

      {showFileUrlBanner && <FileUrlPermissionBanner extensionId={extensionId} />}

      {transientError && (
        <div className="animate-slide-down border-b border-ip-warning/30 bg-ip-warning-muted px-3 py-2">
          <p className="text-[11px] text-ip-warning">{transientError}</p>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 py-4">
        {renderBody()}
      </main>

      {elementVisible && !targetHasSource && selectedElement?.pageSource !== "file" && (
        <div className="border-t border-ip-warning/30 bg-ip-warning-muted px-3 py-2">
          <p className="text-[11px] text-ip-warning">
            No source file detected — changes may require manual file lookup. Ensure your dev server has source maps enabled.
          </p>
        </div>
      )}

      {trayVisible && (
        <div className="px-3 pb-2">
          <ConsoleErrorTray errors={consoleErrors} />
        </div>
      )}

      {elementVisible && disconnected && (
        <div className="border-t border-ip-error/30 bg-ip-error-muted px-3 py-2">
          <p className="text-[11px] text-ip-error">
            Server disconnected — run <span className="font-code">npx @inspatch/server</span> to send changes.
          </p>
        </div>
      )}

      {elementVisible && history.length > 0 && !turnInFlight && !hasPendingPlan && (
        <div className="flex items-center justify-between border-t border-ip-border-subtle bg-ip-bg-secondary/40 px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-ip-text-muted">
            {history.length} turn{history.length === 1 ? "" : "s"} in this conversation
          </span>
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex items-center gap-1 rounded-ip-sm border border-ip-border-subtle bg-ip-bg-tertiary/40 px-2 py-0.5 text-[11px] font-medium text-ip-text-secondary transition-colors hover:border-ip-border-accent hover:text-ip-text-primary"
            title="Start a fresh Claude session for this tab"
          >
            <PlusIcon size={10} />
            New conversation
          </button>
        </div>
      )}

      {elementVisible && (
        <ChangeInput
          onSend={onSendChange}
          disabled={disconnected || turnInFlight || hasPendingPlan}
        />
      )}

      <FooterMeta
        left={<EndpointStatusLine status={connectionStatus} endpoint={SERVER_ENDPOINT_DISPLAY} />}
        right={<span className="text-ip-text-muted/70">v{getExtensionVersion()}</span>}
      />
    </div>
  );

  function renderBody() {
    if (disconnected && !elementVisible) {
      return <StatusGuide onReconnect={onReconnect} />;
    }

    if (inspecting) {
      return <EmptyState />;
    }

    if (!selectedElement) {
      return <OnboardingSteps onStartInspect={onStartInspect} disabled={inspectBlocked} />;
    }

    return (
      <div className="space-y-3">
        <ElementCard
          element={selectedElement}
          targetedXpath={targetedXpath}
          onHover={onElementHover}
          onLeave={onElementLeave}
          onClear={onClear}
          onOpenSource={onOpenSource}
          onRetargetHover={onRetargetHover}
          onRetargetLeave={onRetargetLeave}
          onTargetRow={onTargetRow}
        />
        {history.length > 0 && (
          <ConversationList
            entries={history}
            disconnected={disconnected}
            onApprovePlan={onApprovePlan}
            onCancelPlan={onCancelPlan}
            onOpenSource={onOpenSource}
          />
        )}
      </div>
    );
  }
}

// chrome.runtime.getManifest() is synchronous and safe to call during render in
// MV3 extension contexts; falls back to "?" if unavailable (e.g. dev preview).
function getExtensionVersion(): string {
  try {
    return chrome?.runtime?.getManifest?.()?.version ?? "?";
  } catch {
    return "?";
  }
}

const ENDPOINT_DOT: Record<ConnectionStatus, { cls: string; title: string }> = {
  connected: { cls: "bg-ip-success", title: "Connected" },
  reconnecting: { cls: "bg-ip-warning animate-pulse", title: "Reconnecting\u2026" },
  disconnected: { cls: "bg-ip-error", title: "Disconnected" },
};

function EndpointStatusLine({ status, endpoint }: { status: ConnectionStatus; endpoint: string }) {
  const { cls, title } = ENDPOINT_DOT[status];
  return (
    <span className="inline-flex items-center gap-1.5" title={`${title} — ${endpoint}`}>
      <span className={`inline-flex h-1.5 w-1.5 flex-none rounded-full ${cls}`} />
      <span className="truncate">{endpoint}</span>
    </span>
  );
}
