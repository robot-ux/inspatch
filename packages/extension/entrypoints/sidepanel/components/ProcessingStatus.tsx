import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChangeResult, StatusUpdate } from "@inspatch/shared";
import { mdComponents } from "./markdown";

interface ProcessingStatusProps {
  statusUpdate: StatusUpdate | null;
  changeResult: ChangeResult | null;
  streamedText: string;
  statusLog: string[];
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

type StatusKey = StatusUpdate["status"];
const STATUS_LABELS: Record<StatusKey, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "text-ip-text-muted" },
  analyzing: { label: "Analyzing", tone: "text-ip-info" },
  locating: { label: "Locating files", tone: "text-ip-info" },
  generating: { label: "Generating", tone: "text-ip-text-accent" },
  applying: { label: "Applying changes", tone: "text-ip-warning" },
  complete: { label: "Complete", tone: "text-ip-success" },
  error: { label: "Error", tone: "text-ip-error" },
};

const PROGRESS_STEPS: ReadonlyArray<StatusKey> = [
  "queued",
  "analyzing",
  "locating",
  "generating",
  "applying",
  "complete",
];

const ACTIVE_STATUSES: ReadonlySet<StatusKey> = new Set([
  "queued",
  "analyzing",
  "locating",
  "generating",
  "applying",
]);

function guidanceFor(errorText: string | undefined): string {
  if (!errorText) return "Check the server terminal for details — then send a new message to retry.";
  if (errorText.includes("timed out")) return "Try a simpler change, or increase the server timeout, then send a new message.";
  if (errorText.includes("abort")) return "The request was cancelled. Send a new message when ready.";
  return "Check the server terminal for details — then send a new message to retry.";
}

export function ProcessingStatus({
  statusUpdate,
  changeResult,
  streamedText,
  statusLog,
  onOpenSource,
}: ProcessingStatusProps) {
  if (!statusUpdate && !changeResult) return null;

  if (changeResult) {
    return changeResult.success ? (
      <SuccessCard result={changeResult} onOpenSource={onOpenSource} />
    ) : (
      <FailureCard result={changeResult} />
    );
  }

  return <InFlightCard statusUpdate={statusUpdate!} streamedText={streamedText} statusLog={statusLog} />;
}

interface InFlightCardProps {
  statusUpdate: StatusUpdate;
  streamedText: string;
  statusLog: string[];
}

function InFlightCard({ statusUpdate, streamedText, statusLog }: InFlightCardProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamedText]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const cfg = STATUS_LABELS[statusUpdate.status] ?? { label: statusUpdate.status, tone: "text-ip-text-muted" };
  const isActive = ACTIVE_STATUSES.has(statusUpdate.status);

  const copyStream = async () => {
    try {
      await navigator.clipboard.writeText(streamedText);
      setCopied(true);
    } catch {
      // clipboard blocked — fail silently
    }
  };

  return (
    <div className="relative space-y-2 overflow-hidden rounded-ip-lg border border-ip-text-accent/30 bg-ip-info-muted p-4">
      {isActive && <div className="pointer-events-none absolute inset-0 animate-shimmer" />}

      <div className="relative flex items-center gap-2">
        {isActive && (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-ip-gradient-start border-t-transparent" />
        )}
        <span className={`text-[13px] font-semibold transition-colors duration-300 ${cfg.tone}`}>
          {cfg.label}
        </span>
      </div>

      <ProgressBar status={statusUpdate.status} progress={statusUpdate.progress} />

      {statusLog.length > 0 ? (
        <OperationLog entries={statusLog} />
      ) : (
        <p className="relative text-[12px] text-ip-text-secondary">{statusUpdate.message}</p>
      )}

      {streamedText && (
        <div className="group relative">
          <button
            type="button"
            onClick={copyStream}
            className="absolute right-2 top-2 z-10 rounded-ip-sm bg-ip-bg-tertiary px-2 py-0.5 text-[11px] font-semibold text-ip-text-secondary opacity-0 transition-opacity hover:text-ip-text-primary group-hover:opacity-100"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <div
            ref={streamRef}
            className="max-h-32 space-y-1.5 overflow-y-auto rounded-ip-sm bg-ip-bg-primary p-2"
          >
            <ReactMarkdown components={mdComponents}>{streamedText}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

interface SuccessCardProps {
  result: ChangeResult;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

// Primary files shown inline before collapsing the rest into a "+N more" pill.
// Matches the cap Claude is instructed to respect in the system prompt.
const FILES_DISPLAY_LIMIT = 10;

function SuccessCard({ result, onOpenSource }: SuccessCardProps) {
  const files = result.filesModified ?? [];
  const shown = files.slice(0, FILES_DISPLAY_LIMIT);
  const overflow = files.length - shown.length;

  return (
    <div className="animate-fade-in-scale space-y-2 rounded-ip-lg border border-ip-success/30 bg-ip-success-muted p-4">
      <span className="block text-[13px] font-semibold text-ip-success">Changes applied</span>

      {result.summary && (
        <p className="text-[12px] leading-relaxed text-ip-text-secondary">{result.summary}</p>
      )}

      {result.notes && (
        <p className="text-[11px] leading-relaxed text-ip-text-muted">
          <span className="font-semibold text-ip-text-secondary">Notes: </span>
          {result.notes}
        </p>
      )}

      {shown.length > 0 && (
        <div className="space-y-1 pt-1">
          {shown.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => onOpenSource(file)}
              className="block w-full truncate text-left font-code text-[12px] text-ip-success transition-colors hover:text-ip-success/80 hover:underline"
              title={`${file} — click to open in editor`}
            >
              {file}
            </button>
          ))}
          {overflow > 0 && (
            <span
              className="inline-block rounded-ip-sm bg-ip-bg-tertiary px-1.5 py-0.5 font-code text-[10px] text-ip-text-muted"
              title={files.slice(FILES_DISPLAY_LIMIT).join("\n")}
            >
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface FailureCardProps {
  result: ChangeResult;
}

function FailureCard({ result }: FailureCardProps) {
  return (
    <div className="animate-fade-in-scale space-y-2 rounded-ip-lg border border-ip-error/30 bg-ip-error-muted p-4">
      <span className="block text-[13px] font-semibold text-ip-error">Failed</span>
      {result.error && (
        <div className="space-y-1">
          <p className="text-[12px] text-ip-error/80">{result.error}</p>
          <p className="text-[11px] text-ip-text-muted">{guidanceFor(result.error)}</p>
        </div>
      )}
    </div>
  );
}

interface ProgressBarProps {
  status: StatusKey;
  progress?: number;
}

function ProgressBar({ status, progress }: ProgressBarProps) {
  const ix = PROGRESS_STEPS.indexOf(status);
  const isError = status === "error";
  return (
    <div className="relative flex gap-[3px]">
      {PROGRESS_STEPS.map((step, i) => {
        const done = !isError && i < ix;
        const current = !isError && i === ix;
        const fill = current && typeof progress === "number" ? Math.max(4, Math.min(100, progress)) : 100;
        return (
          <div
            key={step}
            className={`relative h-[3px] flex-1 overflow-hidden rounded-full ${
              done
                ? "bg-ip-text-accent"
                : current
                  ? "bg-ip-bg-tertiary"
                  : isError && i === 0
                    ? "bg-ip-error"
                    : "bg-ip-bg-tertiary"
            }`}
          >
            {current && (
              <div
                className="h-full bg-linear-[90deg] from-ip-gradient-start to-ip-gradient-end transition-[width] duration-300"
                style={{ width: `${fill}%` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OperationLog({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);
  return (
    <div ref={ref} className="relative max-h-20 space-y-0.5 overflow-y-auto">
      {entries.map((entry, i) => (
        <p
          key={`${i}-${entry}`}
          className={`truncate font-code text-[11px] ${
            i === entries.length - 1 ? "text-ip-text-secondary" : "text-ip-text-muted"
          }`}
        >
          {entry}
        </p>
      ))}
    </div>
  );
}

