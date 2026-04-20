import { useState } from "react";
import type { AncestorInfo, ElementSelection } from "@inspatch/shared";
import { ChevronDownIcon, CrosshairIcon, ExternalLinkIcon, XIcon } from "./icons";
import { Pill } from "./Pill";

const DEFAULT_ANCESTORS_VISIBLE = 5;

interface ElementCardProps {
  element: ElementSelection;
  onHover: () => void;
  onLeave: () => void;
  onClear: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
  onAncestorHover: (xpath: string) => void;
  onAncestorLeave: () => void;
  onAncestorSelect: (xpath: string) => void;
}

export function ElementCard({
  element,
  onHover,
  onLeave,
  onClear,
  onOpenSource,
  onAncestorHover,
  onAncestorLeave,
  onAncestorSelect,
}: ElementCardProps) {
  const classList = element.className
    ? element.className
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `.${c}`)
        .join(" ")
    : "";

  const isFile = element.pageSource === "file";
  const kindLabel = isFile ? "Local HTML file" : element.componentName ? "React · Fiber" : "DOM node";
  const primaryLabel = !isFile && element.componentName
    ? `<${element.componentName}>`
    : `<${element.tagName.toLowerCase()}>`;
  const secondary = !isFile && element.componentName
    ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${classList}`
    : classList || (element.id ? `#${element.id}` : "");

  return (
    <div
      className="relative animate-slide-up rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card p-4 shadow-ip-card backdrop-blur-sm transition-all duration-200 hover:border-ip-border-accent hover:shadow-ip-glow-accent"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-code text-[11px] font-medium uppercase tracking-[0.08em] text-ip-text-accent">
          <CrosshairIcon size={11} />
          <span>Selected</span>
        </span>
        <div className="flex-1" />
        <Pill tone="neutral">{kindLabel}</Pill>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Clear selection"
          title="Clear selection"
          className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-ip-sm text-ip-text-muted transition-all duration-150 hover:bg-ip-error-muted hover:text-ip-error active:scale-95"
        >
          <XIcon size={12} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-code text-[18px] font-semibold leading-tight tracking-tight text-ip-text-primary">
          {primaryLabel}
        </span>
        {secondary && (
          <span className="break-all font-code text-[11.5px] text-ip-text-muted">{secondary}</span>
        )}
      </div>

      {isFile ? (
        element.filePath ? (
          <SourceLink file={element.filePath} onOpen={onOpenSource} />
        ) : (
          <p className="mt-1.5 truncate font-code text-[11px] text-ip-text-muted" title={element.xpath}>
            {element.xpath}
          </p>
        )
      ) : element.componentName ? (
        element.sourceFile && (
          <SourceLink
            file={element.sourceFile}
            line={element.sourceLine}
            column={element.sourceColumn}
            onOpen={onOpenSource}
          />
        )
      ) : (
        <p className="mt-2 text-[12px] italic text-ip-text-muted">No React component detected</p>
      )}

      {!isFile && (
        <AncestorList
          ancestors={element.ancestors}
          onHover={onAncestorHover}
          onLeave={onAncestorLeave}
          onSelect={onAncestorSelect}
        />
      )}
    </div>
  );
}

interface AncestorListProps {
  ancestors: AncestorInfo[] | undefined;
  onHover: (xpath: string) => void;
  onLeave: () => void;
  onSelect: (xpath: string) => void;
}

function AncestorList({ ancestors, onHover, onLeave, onSelect }: AncestorListProps) {
  const [expanded, setExpanded] = useState(false);

  if (!ancestors || ancestors.length === 0) return null;

  const isLong = ancestors.length > DEFAULT_ANCESTORS_VISIBLE;
  const visible = !expanded && isLong ? ancestors.slice(0, DEFAULT_ANCESTORS_VISIBLE) : ancestors;
  const hiddenCount = ancestors.length - visible.length;

  return (
    <section
      className="mt-3 border-t border-ip-border-muted pt-2.5"
      onMouseLeave={onLeave}
    >
      <header className="mb-1.5 flex items-center justify-between">
        <span className="font-code text-[10px] uppercase tracking-[0.08em] text-ip-text-muted">
          Ancestors ({ancestors.length})
        </span>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="group inline-flex items-center gap-1 rounded-ip-sm px-1.5 py-0.5 text-[10px] text-ip-text-muted transition-colors hover:bg-ip-bg-tertiary/50 hover:text-ip-text-secondary"
          >
            <span>{expanded ? "Collapse" : `+${hiddenCount} more`}</span>
            <ChevronDownIcon
              size={10}
              className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </header>

      <ul className="flex flex-col gap-0.5">
        {visible.map((a, i) => (
          <li key={`${a.xpath}-${i}`}>
            <AncestorRow depth={i} info={a} onHover={onHover} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface AncestorRowProps {
  depth: number;
  info: AncestorInfo;
  onHover: (xpath: string) => void;
  onSelect: (xpath: string) => void;
}

function AncestorRow({ depth, info, onHover, onSelect }: AncestorRowProps) {
  const classLabel =
    info.classes && info.classes.length > 0
      ? info.classes.map((c) => `.${c}`).join("")
      : "";
  const indent = Math.min(depth, 6) * 8;

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(info.xpath)}
      onFocus={() => onHover(info.xpath)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(info.xpath);
      }}
      title={info.componentName ? `<${info.componentName}> — click to select` : `Click to select ${info.tagName}`}
      className="group flex w-full items-center gap-1.5 rounded-ip-sm px-1.5 py-1 text-left transition-colors duration-100 hover:bg-ip-bg-tertiary/50 focus-visible:bg-ip-bg-tertiary/60"
    >
      <span
        aria-hidden="true"
        className="flex-none font-code text-[10px] leading-none text-ip-border-muted"
        style={{ paddingLeft: `${indent}px` }}
      >
        {depth === 0 ? "└" : "├"}
      </span>
      <span className="min-w-0 flex-1 truncate font-code text-[11.5px]">
        <span className="text-ip-text-accent">{`<${info.tagName}>`}</span>
        {info.id && <span className="text-ip-text-primary">{`#${info.id}`}</span>}
        {classLabel && <span className="text-ip-text-muted">{classLabel}</span>}
      </span>
      {info.componentName && (
        <span className="flex-none rounded-full border border-ip-border-subtle bg-ip-bg-tertiary/40 px-1.5 py-px font-code text-[10px] text-ip-text-secondary">
          {info.componentName}
        </span>
      )}
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
      className="mt-1.5 inline-flex w-full items-center gap-1 truncate text-left font-code text-[12px] text-ip-text-accent transition-colors hover:text-ip-gradient-start hover:underline"
      title={`${file} — click to open in editor`}
    >
      <span className="truncate">{label}</span>
      <ExternalLinkIcon size={10} className="flex-none opacity-70" />
    </button>
  );
}
