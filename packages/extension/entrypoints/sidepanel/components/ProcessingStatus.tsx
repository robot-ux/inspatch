import { useRef, useEffect } from "react";
import type { StatusUpdate, ChangeResult } from "@inspatch/shared";

const statusLabels: Record<string, { label: string; color: string }> = {
  queued: { label: "Queued", color: "text-gray-500" },
  analyzing: { label: "Analyzing", color: "text-blue-600" },
  locating: { label: "Locating files", color: "text-blue-600" },
  generating: { label: "Generating", color: "text-blue-600" },
  applying: { label: "Applying changes", color: "text-purple-600" },
  complete: { label: "Complete", color: "text-green-600" },
  error: { label: "Error", color: "text-red-600" },
};

interface ProcessingStatusProps {
  statusUpdate: StatusUpdate | null;
  changeResult: ChangeResult | null;
  streamedText: string;
  onRetry?: () => void;
}

export function ProcessingStatus({ statusUpdate, changeResult, streamedText, onRetry }: ProcessingStatusProps) {
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [streamedText]);

  if (!statusUpdate && !changeResult) return null;

  if (changeResult) {
    return (
      <div className={`rounded-lg border p-4 space-y-2 animate-fade-in-scale ${changeResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${changeResult.success ? "text-green-700" : "text-red-700"}`}>
            {changeResult.success ? "Changes applied" : "Failed"}
          </span>
        </div>

        {changeResult.error && (
          <div className="space-y-1">
            <p className="text-xs text-red-600">{changeResult.error}</p>
            <p className="text-[11px] text-red-400">
              {changeResult.error.includes("timed out")
                ? "Try a simpler change description, or increase the server timeout."
                : changeResult.error.includes("abort")
                ? "The request was cancelled. Try again when ready."
                : "Check the server terminal for details. You can try again with a different description."}
            </p>
          </div>
        )}

        {changeResult.filesModified && changeResult.filesModified.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">Modified files:</p>
            {changeResult.filesModified.map((file) => (
              <p key={file} className="text-xs font-mono text-green-700">{file}</p>
            ))}
          </div>
        )}

        {changeResult.diff && (
          <pre className="text-xs font-mono text-gray-700 bg-white/60 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
            {changeResult.diff}
          </pre>
        )}

        {!changeResult.success && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (statusUpdate) {
    const config = statusLabels[statusUpdate.status] ?? { label: statusUpdate.status, color: "text-gray-500" };
    const isActive = statusUpdate.status !== "complete" && statusUpdate.status !== "error";

    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2 relative overflow-hidden">
        {isActive && (
          <div className="absolute inset-0 animate-shimmer pointer-events-none" />
        )}
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          )}
          <span className={`text-sm font-medium transition-colors duration-300 ${config.color}`}>
            {config.label}
          </span>
        </div>

        <p className="text-xs text-gray-600">{statusUpdate.message}</p>

        {streamedText && (
          <pre
            ref={textRef}
            className="text-xs font-mono text-gray-700 bg-white/60 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words"
          >
            {streamedText}
          </pre>
        )}
      </div>
    );
  }

  return null;
}
