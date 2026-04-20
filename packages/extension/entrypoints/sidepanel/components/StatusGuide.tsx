import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../hooks/useWebSocket";
import { CheckIcon, CopyIcon, RefreshIcon, TerminalIcon } from "./icons";
import { StatusDot } from "./StatusDot";

const COMMAND = "npx @inspatch/server ./my-app";

interface StatusGuideProps {
  status: Exclude<ConnectionStatus, "connected">;
  onReconnect: () => void;
}

export function StatusGuide({ status, onReconnect }: StatusGuideProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
    } catch {
      // clipboard blocked in extension context — fail silently
    }
  };

  const reconnecting = status === "reconnecting";
  const heading = reconnecting ? "Reconnecting\u2026" : "Server isn't running";
  const sub = reconnecting
    ? "We'll pick up automatically once the server is up."
    : "Start @inspatch/server in your project root and we'll connect automatically.";

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-ip-md border border-ip-error/30 bg-ip-error-muted text-ip-error">
        <TerminalIcon size={16} />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-ip-text-primary">
          {heading}
        </h2>
        <p className="text-[12px] leading-snug text-ip-text-secondary">{sub}</p>
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
          npx <span className="text-ip-text-accent">@inspatch/server</span> ./my-app
        </div>
      </div>

      {reconnecting && (
        <div className="flex items-center gap-2 rounded-ip-sm border border-ip-warning/30 bg-ip-warning-muted px-2.5 py-2 text-[11px] text-ip-text-secondary">
          <StatusDot tone="warning" anim="ping" size={8} />
          <span className="font-code">
            retrying… <span className="text-ip-text-muted">we'll keep trying in the background</span>
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onReconnect}
        className="inline-flex self-start items-center gap-1.5 rounded-ip-sm border border-ip-border-subtle bg-ip-bg-card px-2.5 py-1.5 text-[11px] font-medium text-ip-text-secondary transition-colors duration-150 hover:border-ip-border-accent hover:text-ip-text-primary active:scale-95"
      >
        <RefreshIcon size={11} />
        Retry now
      </button>
    </div>
  );
}
