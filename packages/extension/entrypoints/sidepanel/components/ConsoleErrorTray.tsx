import { useState } from "react";
import type { ConsoleError } from "@inspatch/shared";
import { ChevronDownIcon } from "./icons";

interface ConsoleErrorTrayProps {
  errors: ConsoleError[];
  onClear: () => void;
}

export function ConsoleErrorTray({ errors, onClear }: ConsoleErrorTrayProps) {
  const [expanded, setExpanded] = useState(false);

  if (errors.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-ip-md border border-[rgba(255,110,132,0.30)] bg-ip-error-muted">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[11px]"
        aria-expanded={expanded}
      >
        <span className="font-medium text-ip-error">
          ⚠ {errors.length} console error{errors.length > 1 ? "s" : ""} — will be sent to Claude
        </span>
        <span className="flex items-center gap-2 text-ip-text-muted">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onClear();
              }
            }}
            className="transition-colors hover:text-ip-error"
          >
            clear
          </span>
          <ChevronDownIcon
            size={11}
            className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {expanded && (
        <div className="max-h-28 overflow-y-auto border-t border-[rgba(255,110,132,0.20)]">
          {errors.slice(-5).map((err, i) => (
            <div
              key={`${err.timestamp}-${i}`}
              className="truncate border-b border-[rgba(255,110,132,0.10)] px-3 py-1.5 font-code text-[10px] text-ip-text-secondary last:border-0"
              title={err.message}
            >
              {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
