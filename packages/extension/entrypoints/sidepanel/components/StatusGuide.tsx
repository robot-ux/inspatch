import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, RefreshIcon, TerminalIcon } from "./icons";

const COMMAND = "npx @inspatch/server";
// How long the Retry button stays in its visual "retrying" state after a
// click. Gives the user a clear, stable feedback window regardless of how
// the underlying WS backoff flaps.
const RETRY_PENDING_MS = 900;

interface StatusGuideProps {
  onReconnect: () => void;
}

/**
 * Shown in the page body whenever the WS connection is not healthy.
 * Content is static — the only reactive element is the Retry button,
 * which manages its own short pending state on click. This isolates the
 * loud state changes to a single deliberate user action.
 */
export function StatusGuide({ onReconnect }: StatusGuideProps) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
    } catch {
      // clipboard blocked in extension context — fail silently
    }
  };

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    onReconnect();
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => setRetrying(false), RETRY_PENDING_MS);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-ip-md border border-ip-error/30 bg-ip-error-muted text-ip-error">
        <TerminalIcon size={16} />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-ip-text-primary">
          Server isn't running
        </h2>
        <p className="text-[12px] leading-snug text-ip-text-secondary">
          Start <span className="font-code text-ip-text-primary">@inspatch/server</span> in your project root and we'll connect automatically.
        </p>
      </div>

      <div className="overflow-hidden rounded-ip-md border border-ip-border-subtle bg-ip-bg-secondary">
        <div className="flex items-center justify-between border-b border-ip-border-subtle px-3 py-1.5">
          <span className="font-code text-[10px] uppercase tracking-wider text-ip-text-muted">
            terminal
          </span>
          <button
            type="button"
            onClick={copyCommand}
            aria-label={copied ? "Copied" : "Copy command"}
            className="inline-flex items-center gap-1 rounded-ip-sm px-1.5 py-0.5 text-[10px] font-medium text-ip-text-secondary transition-colors duration-150 hover:bg-ip-bg-tertiary hover:text-ip-text-primary active:scale-95"
          >
            {copied ? (
              <>
                <CheckIcon size={10} /> Copied
              </>
            ) : (
              <>
                <CopyIcon size={10} /> Copy
              </>
            )}
          </button>
        </div>
        <div className="px-3 py-2.5 font-code text-[12px] leading-[1.6] text-ip-text-primary">
          <span className="text-ip-text-muted">$ </span>
          npx <span className="text-ip-text-accent">@inspatch/server</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex self-start items-center gap-1.5 rounded-ip-sm border border-ip-border-subtle bg-ip-bg-card px-2.5 py-1.5 text-[11px] font-medium text-ip-text-secondary transition-colors duration-150 hover:border-ip-border-accent hover:text-ip-text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshIcon size={11} className={retrying ? "animate-spin" : undefined} />
        {retrying ? "Retrying…" : "Retry now"}
      </button>
    </div>
  );
}
