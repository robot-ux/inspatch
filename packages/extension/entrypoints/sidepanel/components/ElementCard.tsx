import { useState } from "react";
import type { ElementSelection } from "@inspatch/shared";
import { ChevronDownIcon, XIcon } from "./icons";

interface ElementCardProps {
  element: ElementSelection;
  onHover: () => void;
  onLeave: () => void;
  onClear: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

export function ElementCard({ element, onHover, onLeave, onClear, onOpenSource }: ElementCardProps) {
  const [chainExpanded, setChainExpanded] = useState(false);

  const classList = element.className
    ? element.className
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `.${c}`)
        .join(" ")
    : "";

  return (
    <div
      className="relative animate-slide-up space-y-2 rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card p-4 shadow-ip-card transition-all duration-200 hover:border-ip-border-accent hover:shadow-ip-glow-accent"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        aria-label="Clear selection"
        title="Clear selection"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-ip-sm text-ip-text-muted transition-all duration-150 hover:bg-ip-error-muted hover:text-ip-error active:scale-95"
      >
        <XIcon size={14} />
      </button>

      <div className="pr-6">
        <span className="font-code text-[16px] font-semibold text-ip-text-primary">
          {element.tagName}
        </span>
      </div>

      {element.id && <p className="font-code text-[13px] text-ip-text-accent">#{element.id}</p>}

      {classList && (
        <p className="break-all font-code text-[12px] text-ip-text-secondary">{classList}</p>
      )}

      <p className="truncate font-code text-[11px] text-ip-text-muted" title={element.xpath}>
        {element.xpath}
      </p>

      <div className="mt-2 space-y-1.5 border-t border-ip-border-subtle pt-2">
        {element.pageSource === "file" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-code text-[12px] text-ip-text-muted">📄</span>
              <span className="font-code text-[13px] font-semibold text-[#C084FC]">
                Local HTML file
              </span>
            </div>

            {element.filePath && (
              <SourceLink
                file={element.filePath}
                onOpen={onOpenSource}
              />
            )}
          </>
        ) : element.componentName ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-code text-[12px] text-ip-text-muted">&lt;/&gt;</span>
              <span className="font-code text-[13px] font-semibold text-[#C084FC]">
                {element.componentName}
              </span>
            </div>

            <ParentChain
              chain={element.parentChain}
              expanded={chainExpanded}
              onToggle={() => setChainExpanded((v) => !v)}
            />

            {element.sourceFile && (
              <SourceLink
                file={element.sourceFile}
                line={element.sourceLine}
                column={element.sourceColumn}
                onOpen={onOpenSource}
              />
            )}
          </>
        ) : (
          <p className="text-[12px] italic text-ip-text-muted">No React component detected</p>
        )}
      </div>
    </div>
  );
}

interface ParentChainProps {
  chain: string[] | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function ParentChain({ chain, expanded, onToggle }: ParentChainProps) {
  if (!chain || chain.length <= 1) return null;
  const isLong = chain.length > 3;
  const visible = !expanded && isLong ? chain.slice(-3) : chain;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="group block w-full text-left"
      title={expanded ? "Collapse" : "Expand full chain"}
      aria-expanded={expanded}
    >
      <p className="flex flex-wrap items-center gap-1 font-code text-[11px] text-ip-text-muted">
        {!expanded && isLong && <span className="text-ip-border-muted">…</span>}
        {visible.map((name, i) => (
          <span key={`${name}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-ip-border-muted">{">"}</span>}
            <span
              className={i === visible.length - 1 ? "text-ip-text-secondary" : "text-ip-text-muted"}
            >
              {name}
            </span>
          </span>
        ))}
        {isLong && (
          <ChevronDownIcon
            size={11}
            className={`ml-0.5 flex-shrink-0 text-ip-text-muted transition-transform duration-150 group-hover:text-ip-text-secondary ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </p>
    </button>
  );
}

interface SourceLinkProps {
  file: string;
  line?: number;
  column?: number;
  onOpen: (file: string, line?: number, column?: number) => void;
}

function SourceLink({ file, line, column, onOpen }: SourceLinkProps) {
  const parts = file.split("/");
  const truncated = parts.length > 3 ? "…/" + parts.slice(-3).join("/") : file;
  const label = `${truncated}${line ? `:${line}` : ""}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(file, line, column);
      }}
      className="block w-full truncate text-left font-code text-[12px] text-ip-success transition-colors hover:text-ip-success/80 hover:underline"
      title={`${file} — click to open in editor`}
    >
      {label}
    </button>
  );
}
