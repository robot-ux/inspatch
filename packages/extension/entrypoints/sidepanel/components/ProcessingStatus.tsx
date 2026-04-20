import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChangeResult, StatusUpdate } from "@inspatch/shared";
import { mdComponents } from "./markdown";

interface ProcessingStatusProps {
  statusUpdate: StatusUpdate | null;
  changeResult: ChangeResult | null;
  streamedText: string;
  statusLog: string[];
  onRetry: () => void;
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
  if (!errorText) return "Check the server terminal for details. You can try again with a different description.";
  if (errorText.includes("timed out")) return "Try a simpler change description, or increase the server timeout.";
  if (errorText.includes("abort")) return "The request was cancelled. Try again when ready.";
  return "Check the server terminal for details. You can try again with a different description.";
}

export function ProcessingStatus({
  statusUpdate,
  changeResult,
  streamedText,
  statusLog,
  onRetry,
  onOpenSource,
}: ProcessingStatusProps) {
  if (!statusUpdate && !changeResult) return null;

  if (changeResult) {
    return changeResult.success ? (
      <SuccessCard result={changeResult} onOpenSource={onOpenSource} />
    ) : (
      <FailureCard result={changeResult} onRetry={onRetry} />
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

function SuccessCard({ result, onOpenSource }: SuccessCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyDiff = async () => {
    if (!result.diff) return;
    try {
      await navigator.clipboard.writeText(result.diff);
      setCopied(true);
    } catch {
      // ignore
    }
  };

  return (
    <div className="animate-fade-in-scale space-y-2 rounded-ip-lg border border-ip-success/30 bg-ip-success-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {result.summary ? (
            <ReactMarkdown components={mdComponents}>{result.summary}</ReactMarkdown>
          ) : (
            <span className="text-[13px] font-semibold text-ip-success">Changes applied</span>
          )}
        </div>
        {result.diffMode === "snapshot" && (
          <span
            title="Diff computed by comparing pre-run snapshots (project isn't a Git repo)"
            className="shrink-0 rounded-ip-sm border border-ip-border-accent px-1.5 py-0.5 font-code text-[10px] uppercase tracking-wide text-ip-info"
          >
            snapshot diff
          </span>
        )}
      </div>

      {result.filesModified && result.filesModified.length > 0 && (
        <div className="space-y-1">
          {result.filesModified.map((file) => (
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
        </div>
      )}

      {result.diff && (
        <div className="group relative mt-2">
          <button
            type="button"
            onClick={copyDiff}
            className="absolute right-2 top-2 z-10 rounded-ip-sm bg-ip-bg-tertiary px-2 py-0.5 text-[11px] font-semibold text-ip-text-secondary opacity-0 transition-opacity hover:text-ip-text-primary group-hover:opacity-100 active:scale-95"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <DiffBlock diff={result.diff} />
        </div>
      )}
    </div>
  );
}

interface FailureCardProps {
  result: ChangeResult;
  onRetry: () => void;
}

function FailureCard({ result, onRetry }: FailureCardProps) {
  return (
    <div className="animate-fade-in-scale space-y-2 rounded-ip-lg border border-ip-error/30 bg-ip-error-muted p-4">
      <span className="block text-[13px] font-semibold text-ip-error">Failed</span>
      {result.error && (
        <div className="space-y-1">
          <p className="text-[12px] text-ip-error/80">{result.error}</p>
          <p className="text-[11px] text-ip-text-muted">{guidanceFor(result.error)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-ip-sm bg-ip-error px-3 py-1 text-[11px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-95"
      >
        Try Again
      </button>
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

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="max-h-48 overflow-y-auto rounded-ip-sm bg-ip-bg-primary p-2 font-code text-[11px]">
      {lines.map((line, i) => {
        let tone = "text-ip-text-muted";
        if (line.startsWith("+")) tone = "text-ip-success";
        else if (line.startsWith("-")) tone = "text-ip-error";
        else if (line.startsWith("@@")) tone = "text-ip-info";
        return (
          <div key={i} className="flex whitespace-pre-wrap">
            <span className="w-8 shrink-0 select-none pr-2 text-right text-ip-text-muted">
              {i + 1}
            </span>
            <span className={tone}>{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
