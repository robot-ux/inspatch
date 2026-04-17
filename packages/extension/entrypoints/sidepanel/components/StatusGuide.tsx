import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../hooks/useWebSocket";
import { CheckIcon, CopyIcon, RefreshIcon, TerminalIcon } from "./icons";

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

  const heading = status === "reconnecting" ? "Reconnecting to server…" : "Server not running";

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-ip-md border border-ip-border-subtle bg-ip-bg-card text-ip-text-muted">
          <TerminalIcon size={14} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-ip-text-primary">{heading}</span>
          <span className="text-[11px] leading-snug text-ip-text-muted">
            Inspatch talks to a local server on{" "}
            <span className="font-code text-ip-text-accent">127.0.0.1:9377</span>. Start it from your project root.
          </span>
        </div>
      </div>

      <div className="group relative rounded-ip-md border border-ip-border-subtle bg-ip-bg-card px-3 py-2">
        <code className="select-all break-all font-code text-[11px] text-ip-text-secondary">
          {COMMAND}
        </code>
        <button
          type="button"
          onClick={copyCommand}
          aria-label={copied ? "Copied" : "Copy command"}
          className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-ip-sm bg-ip-bg-tertiary px-2 py-1 text-[10px] font-medium text-ip-text-secondary opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 active:scale-95"
        >
          {copied ? (
            <>
              <CheckIcon size={11} /> Copied
            </>
          ) : (
            <>
              <CopyIcon size={11} /> Copy
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onReconnect}
        className="inline-flex self-start items-center gap-1.5 rounded-ip-sm border border-ip-border-subtle bg-ip-bg-card px-2.5 py-1.5 text-[11px] font-medium text-ip-text-secondary transition-colors duration-150 hover:border-ip-border-accent hover:text-ip-text-primary active:scale-95"
      >
        <RefreshIcon size={11} />
        Try reconnecting
      </button>
    </div>
  );
}
