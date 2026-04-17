import type { ChangeResult, ConsoleError, ElementSelection, StatusUpdate } from "@inspatch/shared";
import type { ConnectionStatus } from "../hooks/useWebSocket";
import { ChangeInput } from "../components/ChangeInput";
import { ConsoleErrorTray } from "../components/ConsoleErrorTray";
import { ElementCard } from "../components/ElementCard";
import { EmptyState } from "../components/EmptyState";
import { HeaderBar } from "../components/HeaderBar";
import { OnboardingSteps } from "../components/OnboardingSteps";
import { ProcessingStatus } from "../components/ProcessingStatus";
import { StatusGuide } from "../components/StatusGuide";

type InspectState = "idle" | "inspecting";

interface SidePanelMainProps {
  connectionStatus: ConnectionStatus;
  onReconnect: () => void;

  inspectState: InspectState;
  hasUsedInspect: boolean;
  selectedElement: ElementSelection | null;
  processing: StatusUpdate | null;
  changeResult: ChangeResult | null;
  streamedText: string;
  statusLog: string[];
  consoleErrors: ConsoleError[];
  transientError: string | null;

  onStartInspect: () => void;
  onStopInspect: () => void;
  onClear: () => void;
  onElementHover: () => void;
  onElementLeave: () => void;
  onSendChange: (description: string, imageDataUrl?: string) => void;
  onRetry: () => void;
  onClearConsoleErrors: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

export function SidePanelMain(props: SidePanelMainProps) {
  const {
    connectionStatus,
    onReconnect,
    inspectState,
    hasUsedInspect,
    selectedElement,
    processing,
    changeResult,
    streamedText,
    statusLog,
    consoleErrors,
    transientError,
    onStartInspect,
    onStopInspect,
    onClear,
    onElementHover,
    onElementLeave,
    onSendChange,
    onRetry,
    onClearConsoleErrors,
    onOpenSource,
  } = props;

  const inspecting = inspectState === "inspecting";
  const showCompactToggle = hasUsedInspect || !!selectedElement || inspecting;
  const disconnected = connectionStatus !== "connected";
  const elementVisible = !!selectedElement && !inspecting;
  const trayVisible =
    elementVisible && consoleErrors.length > 0 && !processing && !changeResult;

  return (
    <div className="flex h-screen flex-col bg-ip-bg-primary">
      <HeaderBar
        status={connectionStatus}
        showInspectToggle={showCompactToggle}
        inspecting={inspecting}
        inspectDisabled={disconnected}
        onInspect={inspecting ? onStopInspect : onStartInspect}
        onReconnect={onReconnect}
      />

      {transientError && (
        <div className="animate-slide-down border-b border-[rgba(193,128,255,0.30)] bg-ip-warning-muted px-4 py-2">
          <p className="text-[11px] text-ip-warning">{transientError}</p>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4">
        {renderBody()}
      </main>

      {elementVisible && !selectedElement?.sourceFile && (
        <div className="border-t border-[rgba(193,128,255,0.30)] bg-ip-warning-muted px-4 py-2">
          <p className="text-[11px] text-ip-warning">
            No source file detected — changes may require manual file lookup. Ensure your dev server has source maps enabled.
          </p>
        </div>
      )}

      {trayVisible && (
        <div className="px-3 pb-2">
          <ConsoleErrorTray errors={consoleErrors} onClear={onClearConsoleErrors} />
        </div>
      )}

      {elementVisible && (
        <ChangeInput onSend={onSendChange} disabled={disconnected || !!processing} />
      )}
    </div>
  );

  function renderBody() {
    if (disconnected && !elementVisible) {
      return <StatusGuide status={connectionStatus} onReconnect={onReconnect} />;
    }

    if (inspecting) {
      return <EmptyState variant="inspecting" />;
    }

    if (!selectedElement) {
      if (hasUsedInspect) return <EmptyState variant="idle" />;
      return <OnboardingSteps onStartInspect={onStartInspect} disabled={disconnected} />;
    }

    return (
      <div className="space-y-3">
        <ElementCard
          element={selectedElement}
          onHover={onElementHover}
          onLeave={onElementLeave}
          onClear={onClear}
          onOpenSource={onOpenSource}
        />
        {(processing || changeResult) && (
          <div className="animate-fade-in-scale">
            <ProcessingStatus
              statusUpdate={processing}
              changeResult={changeResult}
              streamedText={streamedText}
              statusLog={statusLog}
              onRetry={onRetry}
              onOpenSource={onOpenSource}
            />
          </div>
        )}
      </div>
    );
  }
}
