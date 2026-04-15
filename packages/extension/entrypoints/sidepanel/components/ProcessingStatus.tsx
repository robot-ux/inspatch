import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { StatusUpdate, ChangeResult } from "@inspatch/shared";

// Markdown component overrides matching the existing design system
const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[12px] text-ip-text-secondary leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ip-text-primary">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-ip-text-secondary">{children}</em>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    // block code has a language className, inline does not
    const isBlock = !!className
    if (isBlock) {
      return (
        <code className="block font-code text-[11px] text-ip-text-secondary bg-ip-bg-primary rounded-[var(--ip-radius-sm)] p-2 mt-1 overflow-x-auto whitespace-pre">
          {children}
        </code>
      )
    }
    return (
      <code className="font-code text-[11px] text-ip-text-accent bg-ip-bg-primary px-1 py-0.5 rounded">
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mt-1">{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-0.5 pl-3 list-disc list-outside marker:text-ip-text-muted">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="space-y-0.5 pl-3 list-decimal list-outside marker:text-ip-text-muted">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-[12px] text-ip-text-secondary leading-relaxed">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-[13px] font-semibold text-ip-text-primary">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-[13px] font-semibold text-ip-text-primary">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-[12px] font-semibold text-ip-text-primary">{children}</h3>
  ),
}

function OperationLog({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <div ref={ref} className="max-h-20 overflow-y-auto space-y-0.5">
      {entries.map((entry, i) => (
        <p
          key={i}
          className={`text-[11px] font-code truncate ${
            i === entries.length - 1 ? "text-ip-text-secondary" : "text-ip-text-muted"
          }`}
        >
          {entry}
        </p>
      ))}
    </div>
  );
}

const statusLabels: Record<string, { label: string; color: string }> = {
  queued: { label: "Queued", color: "text-ip-text-muted" },
  analyzing: { label: "Analyzing", color: "text-ip-info" },
  locating: { label: "Locating files", color: "text-ip-info" },
  generating: { label: "Generating", color: "text-ip-text-accent" },
  applying: { label: "Applying changes", color: "text-[#C084FC]" },
  complete: { label: "Complete", color: "text-ip-success" },
  error: { label: "Error", color: "text-ip-error" },
};

function DiffBlock({ diff, onCopy, isCopied }: { diff: string; onCopy: () => void; isCopied: boolean }) {
  const lines = diff.split('\n');
  return (
    <div className="relative group mt-2">
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 px-2 py-0.5 text-[11px] font-semibold bg-ip-bg-tertiary text-ip-text-secondary rounded-[var(--ip-radius-sm)] opacity-0 group-hover:opacity-100 transition-opacity hover:text-ip-text-primary z-10"
      >
        {isCopied ? 'Copied' : 'Copy'}
      </button>
      <div className="text-[11px] font-code bg-ip-bg-primary rounded-[var(--ip-radius-sm)] p-2 max-h-48 overflow-y-auto">
        {lines.map((line, i) => {
          let colorClass = 'text-ip-text-muted';
          if (line.startsWith('+')) colorClass = 'text-ip-success';
          else if (line.startsWith('-')) colorClass = 'text-ip-error';
          else if (line.startsWith('@@')) colorClass = 'text-ip-info';
          return (
            <div key={i} className="flex whitespace-pre-wrap">
              <span className="text-ip-text-muted select-none w-8 text-right pr-2 shrink-0">{i + 1}</span>
              <span className={colorClass}>{line || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProcessingStatusProps {
  statusUpdate: StatusUpdate | null;
  changeResult: ChangeResult | null;
  streamedText: string;
  statusLog?: string[];
  onRetry?: () => void;
}

export function ProcessingStatus({ statusUpdate, changeResult, streamedText, statusLog, onRetry }: ProcessingStatusProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [streamedText]);

  if (!statusUpdate && !changeResult) return null;

  if (changeResult) {
    if (changeResult.success) {
      return (
        <div className="rounded-ip-lg border p-4 space-y-2 animate-fade-in-scale border-[rgba(34,197,94,0.3)] bg-ip-success-muted">
          {changeResult.summary ? (
            <div className="space-y-1.5">
              <ReactMarkdown components={mdComponents}>{changeResult.summary}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-[13px] font-semibold text-ip-success">Changes applied</span>
          )}

          {changeResult.filesModified && changeResult.filesModified.length > 0 && (
            <div className="space-y-1">
              {changeResult.filesModified.map((file) => (
                <p key={file} className="text-[12px] font-code text-ip-success">{file}</p>
              ))}
            </div>
          )}

          {changeResult.diff && (
            <DiffBlock
              diff={changeResult.diff}
              onCopy={() => copyToClipboard(changeResult.diff!, 'diff')}
              isCopied={copied === 'diff'}
            />
          )}
        </div>
      );
    }

    return (
      <div className="rounded-ip-lg border p-4 space-y-2 animate-fade-in-scale border-[rgba(239,68,68,0.3)] bg-ip-error-muted">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ip-error">Failed</span>
        </div>

        {changeResult.error && (
          <div className="space-y-1">
            <p className="text-[12px] text-ip-error/80">{changeResult.error}</p>
            <p className="text-[11px] text-ip-text-muted">
              {changeResult.error.includes("timed out")
                ? "Try a simpler change description, or increase the server timeout."
                : changeResult.error.includes("abort")
                ? "The request was cancelled. Try again when ready."
                : "Check the server terminal for details. You can try again with a different description."}
            </p>
          </div>
        )}

        {!changeResult.success && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 bg-ip-error hover:bg-ip-error/90 text-white text-[11px] font-semibold rounded-[var(--ip-radius-sm)] transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (statusUpdate) {
    const config = statusLabels[statusUpdate.status] ?? { label: statusUpdate.status, color: "text-ip-text-muted" };
    const isActive = statusUpdate.status !== "complete" && statusUpdate.status !== "error";

    return (
      <div className="rounded-ip-lg border border-[rgba(59,130,246,0.3)] bg-ip-info-muted p-4 space-y-2 relative overflow-hidden">
        {isActive && (
          <div className="absolute inset-0 animate-shimmer pointer-events-none" />
        )}
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="w-3 h-3 border-2 border-ip-gradient-start border-t-transparent rounded-full animate-spin" />
          )}
          <span className={`text-[13px] font-semibold transition-colors duration-300 ${config.color}`}>
            {config.label}
          </span>
        </div>

        {statusLog && statusLog.length > 0 ? (
          <OperationLog entries={statusLog} />
        ) : (
          <p className="text-[12px] text-ip-text-secondary">{statusUpdate.message}</p>
        )}

        {streamedText && (
          <div className="relative group">
            <button
              onClick={() => copyToClipboard(streamedText, 'stream')}
              className="absolute top-2 right-2 px-2 py-0.5 text-[11px] font-semibold bg-ip-bg-tertiary text-ip-text-secondary rounded-[var(--ip-radius-sm)] opacity-0 group-hover:opacity-100 transition-opacity hover:text-ip-text-primary z-10"
            >
              {copied === 'stream' ? 'Copied' : 'Copy'}
            </button>
            <div
              ref={textRef}
              className="bg-ip-bg-primary rounded-[var(--ip-radius-sm)] p-2 max-h-32 overflow-y-auto space-y-1.5"
            >
              <ReactMarkdown components={mdComponents}>{streamedText}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
