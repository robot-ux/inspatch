import { useEffect, useRef } from "react";
import type { ConversationEntry } from "../hooks/useTabSessions";
import { PlanProposal } from "./PlanProposal";
import { ProcessingStatus } from "./ProcessingStatus";

interface ConversationListProps {
  entries: ConversationEntry[];
  disconnected: boolean;
  onApprovePlan: () => void;
  onCancelPlan: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

/**
 * Chat-style transcript of every turn in the current conversation. Each
 * entry is rendered as a compact user-message bubble followed by Claude's
 * evolving response for that turn (status pill → streaming text → plan
 * proposal → diff / error).
 */
export function ConversationList({
  entries,
  disconnected,
  onApprovePlan,
  onCancelPlan,
  onOpenSource,
}: ConversationListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest turn as it grows. Only the last entry's
  // streaming text / status really moves, so a single dep chase is enough.
  const last = entries[entries.length - 1];
  const streamLen = last?.streamedText.length ?? 0;
  const logLen = last?.statusLog.length ?? 0;
  const hasResult = !!last?.changeResult;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, streamLen, logLen, hasResult]);

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <EntryCard
          key={entry.requestId}
          entry={entry}
          disconnected={disconnected}
          onApprovePlan={onApprovePlan}
          onCancelPlan={onCancelPlan}
          onOpenSource={onOpenSource}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface EntryCardProps {
  entry: ConversationEntry;
  disconnected: boolean;
  onApprovePlan: () => void;
  onCancelPlan: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

function EntryCard({
  entry,
  disconnected,
  onApprovePlan,
  onCancelPlan,
  onOpenSource,
}: EntryCardProps) {
  return (
    <div className="space-y-2">
      <UserBubble entry={entry} />
      {entry.pendingPlan ? (
        <PlanProposal
          plan={entry.pendingPlan}
          onApprove={onApprovePlan}
          onCancel={onCancelPlan}
          disabled={disconnected}
        />
      ) : (
        (entry.processing || entry.changeResult) && (
          <div className="animate-fade-in-scale">
            <ProcessingStatus
              statusUpdate={entry.processing}
              changeResult={entry.changeResult}
              streamedText={entry.streamedText}
              statusLog={entry.statusLog}
              onOpenSource={onOpenSource}
            />
          </div>
        )
      )}
    </div>
  );
}

function UserBubble({ entry }: { entry: ConversationEntry }) {
  const { userText, target, screenshotDataUrl } = entry;
  const targetLabel = target.componentName
    ? `<${target.componentName}>`
    : shortenXpath(target.xpath);
  const sourceLabel = target.sourceFile
    ? `${shortenPath(target.sourceFile)}${target.sourceLine ? `:${target.sourceLine}` : ""}`
    : null;

  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-ip-lg border border-ip-border-subtle bg-ip-bg-tertiary/40 px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-ip-text-muted">
          <span className="font-code">{targetLabel}</span>
          {sourceLabel && (
            <>
              <span className="opacity-40">·</span>
              <span className="font-code">{sourceLabel}</span>
            </>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-left text-[12px] text-ip-text-primary">
          {userText}
        </p>
        {screenshotDataUrl && (
          <img
            src={screenshotDataUrl}
            alt="attached screenshot"
            className="mt-1.5 max-h-24 rounded-ip-sm border border-ip-border-subtle object-cover"
          />
        )}
      </div>
    </div>
  );
}

function shortenXpath(xpath: string): string {
  const parts = xpath.split("/").filter(Boolean);
  return parts.length <= 2 ? xpath : `…/${parts.slice(-2).join("/")}`;
}

function shortenPath(file: string): string {
  const parts = file.split("/");
  return parts.length <= 2 ? file : parts.slice(-2).join("/");
}
