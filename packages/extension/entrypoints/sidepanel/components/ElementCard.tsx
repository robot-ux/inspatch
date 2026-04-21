import { useRef } from "react";
import type { AncestorInfo, DescendantInfo, ElementSelection } from "@inspatch/shared";
import { CrosshairIcon, ExternalLinkIcon, XIcon } from "./icons";
import { Pill } from "./Pill";
import { anchorNode, resolveTargetedNode, type TreeNode } from "../utils/tree";

interface ElementCardProps {
  element: ElementSelection;
  targetedXpath: string | null;
  onHover: () => void;
  onLeave: () => void;
  onClear: () => void;
  onOpenSource: (file: string, line?: number, column?: number) => void;
  onRetargetHover: (xpath: string) => void;
  onRetargetLeave: () => void;
  onTargetRow: (xpath: string) => void;
}

export function ElementCard({
  element,
  targetedXpath,
  onHover,
  onLeave,
  onClear,
  onOpenSource,
  onRetargetHover,
  onRetargetLeave,
  onTargetRow,
}: ElementCardProps) {
  // Intro animation plays only on the initial mount — the card persists across
  // tree-row retargets, so replaying slide-up on each click would look jumpy.
  const isFirstRender = useRef(true);
  const introClass = isFirstRender.current ? "animate-slide-up" : "";
  isFirstRender.current = false;

  const anchor = anchorNode(element);
  const effectiveTargetXpath = targetedXpath ?? anchor.xpath;
  const target = resolveTargetedNode(element, effectiveTargetXpath);
  const isFile = element.pageSource === "file";
  const kindLabel = isFile ? "Local HTML file" : anchor.componentName ? "React · Fiber" : "DOM node";

  return (
    <div
      className={`relative ${introClass} rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card p-4 shadow-ip-card backdrop-blur-sm transition-all duration-200 hover:border-ip-border-accent hover:shadow-ip-glow-accent`}
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

      <ElementTree
        anchor={anchor}
        ancestors={element.ancestors}
        descendants={element.descendants}
        targetedXpath={effectiveTargetXpath}
        onRetargetHover={onRetargetHover}
        onRetargetLeave={onRetargetLeave}
        onTargetRow={onTargetRow}
      />

      <TargetDetail
        target={target}
        isAnchor={target.xpath === anchor.xpath}
        isFile={isFile}
        filePath={element.filePath}
        sourceColumn={target.xpath === anchor.xpath ? element.sourceColumn : undefined}
        onOpenSource={onOpenSource}
      />
    </div>
  );
}

interface ElementTreeProps {
  anchor: TreeNode;
  ancestors: AncestorInfo[] | undefined;
  descendants: DescendantInfo[] | undefined;
  targetedXpath: string;
  onRetargetHover: (xpath: string) => void;
  onRetargetLeave: () => void;
  onTargetRow: (xpath: string) => void;
}

function ElementTree({
  anchor,
  ancestors,
  descendants,
  targetedXpath,
  onRetargetHover,
  onRetargetLeave,
  onTargetRow,
}: ElementTreeProps) {
  const descendantList = descendants ?? [];
  // `ancestors` is ordered nearest-first — render top-down so the outermost
  // element sits at the top of the tree (Chrome DevTools convention). The
  // content script already caps depth (ANCESTOR_MAX_DEPTH = 12), so we render
  // the full list without a collapse affordance.
  const orderedAncestors = [...(ancestors ?? [])].reverse();

  return (
    <section
      className="mt-3 border-t border-ip-border-muted pt-2.5"
      onMouseLeave={onRetargetLeave}
    >
      <header className="mb-1.5 flex items-center">
        <span className="font-code text-[10px] uppercase tracking-[0.08em] text-ip-text-muted">
          Element tree
        </span>
      </header>

      <ul className="flex flex-col gap-0.5">
        {orderedAncestors.map((a, i) => (
          <li key={`a-${a.xpath}`}>
            <TreeRow
              info={a}
              depth={i}
              isTarget={a.xpath === targetedXpath}
              isAnchor={false}
              onHover={onRetargetHover}
              onSelect={onTargetRow}
            />
          </li>
        ))}
        <li key={`anchor-${anchor.xpath}`}>
          <TreeRow
            info={anchor}
            depth={orderedAncestors.length}
            isTarget={anchor.xpath === targetedXpath}
            isAnchor
            onHover={onRetargetHover}
            onSelect={onTargetRow}
          />
        </li>
        {descendantList.map((d, i) => (
          <li key={`d-${d.xpath}-${i}`}>
            <TreeRow
              info={d}
              depth={orderedAncestors.length + d.depth}
              isTarget={d.xpath === targetedXpath}
              isAnchor={false}
              onHover={onRetargetHover}
              onSelect={onTargetRow}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TreeRowProps {
  info: TreeNode;
  depth: number;
  isTarget: boolean;
  isAnchor: boolean;
  onHover: (xpath: string) => void;
  onSelect: (xpath: string) => void;
}

function TreeRow({ info, depth, isTarget, isAnchor, onHover, onSelect }: TreeRowProps) {
  const classLabel =
    info.classes && info.classes.length > 0
      ? info.classes.map((c) => `.${c}`).join("")
      : "";
  const indent = Math.min(depth, 8) * 10;
  // Diamond follows the current target so clicking any row moves the marker
  // to it; anchor is only distinguished via tooltip copy.
  const marker = isTarget ? "◆" : "·";
  const markerColor = isTarget ? "text-ip-text-accent" : "text-ip-border-muted";

  const containerBase =
    "flex w-full items-center gap-1.5 rounded-ip-sm px-1.5 py-1 text-left transition-colors duration-150";
  const containerState = isTarget
    ? "border border-ip-border-accent/60 bg-ip-info-muted/50"
    : "border border-transparent hover:bg-ip-bg-tertiary/50 focus-visible:bg-ip-bg-tertiary/60";

  const title = isAnchor
    ? `Inspect anchor${isTarget ? " — currently targeted" : " — click to target"}`
    : info.componentName
      ? `<${info.componentName}>${isTarget ? " — currently targeted" : " — click to target"}`
      : `${info.tagName}${isTarget ? " — currently targeted" : " — click to target"}`;

  return (
    <button
      type="button"
      aria-current={isTarget || undefined}
      onMouseEnter={() => onHover(info.xpath)}
      onFocus={() => onHover(info.xpath)}
      onClick={(e) => {
        e.stopPropagation();
        if (!isTarget) onSelect(info.xpath);
      }}
      title={title}
      className={`${containerBase} ${containerState}`}
    >
      <span
        aria-hidden="true"
        className={`flex-none font-code text-[11px] leading-none ${markerColor}`}
        style={{ paddingLeft: `${indent}px` }}
      >
        {marker}
      </span>
      <span className="min-w-0 flex-1 truncate font-code text-[11.5px]">
        <span className={isTarget ? "text-ip-text-accent" : "text-ip-text-accent/80"}>
          {`<${info.tagName}>`}
        </span>
        {info.id && (
          <span className={isTarget ? "text-ip-text-primary" : "text-ip-text-primary/90"}>
            {`#${info.id}`}
          </span>
        )}
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

interface TargetDetailProps {
  target: TreeNode;
  isAnchor: boolean;
  isFile: boolean;
  filePath: string | undefined;
  sourceColumn: number | undefined;
  onOpenSource: (file: string, line?: number, column?: number) => void;
}

function TargetDetail({
  target,
  isAnchor,
  isFile,
  filePath,
  sourceColumn,
  onOpenSource,
}: TargetDetailProps) {
  const classList =
    target.classes && target.classes.length > 0
      ? target.classes.map((c) => `.${c}`).join(" ")
      : "";
  const primaryLabel = !isFile && target.componentName
    ? `<${target.componentName}>`
    : `<${target.tagName}>`;
  const secondary = !isFile && target.componentName
    ? `${target.tagName}${target.id ? `#${target.id}` : ""}${classList ? ` ${classList}` : ""}`
    : classList || (target.id ? `#${target.id}` : "");

  // File pages never resolve sources; they always render the filePath (shared
  // by every row) as an info-only link. React anchors / ancestors render a
  // clickable Open-in-Editor link when their fiber had _debugSource.
  const showFileLink = isFile && isAnchor && !!filePath;
  const showSourceLink = !isFile && !!target.sourceFile;

  return (
    <section className="mt-3 border-t border-ip-border-muted pt-2.5">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-code text-[10px] uppercase tracking-[0.08em] text-ip-text-muted">
          Target
        </span>
        {!isAnchor && (
          <span className="rounded-full border border-ip-border-subtle bg-ip-bg-tertiary/40 px-1.5 py-px font-code text-[10px] text-ip-text-secondary">
            retargeted from anchor
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-code text-[16px] font-semibold leading-tight tracking-tight text-ip-text-primary">
          {primaryLabel}
        </span>
        {secondary && (
          <span className="break-all font-code text-[11.5px] text-ip-text-muted">{secondary}</span>
        )}
      </div>

      {showFileLink && (
        <SourceLink file={filePath!} onOpen={onOpenSource} />
      )}
      {showSourceLink && (
        <SourceLink
          file={target.sourceFile!}
          line={target.sourceLine}
          column={sourceColumn}
          onOpen={onOpenSource}
        />
      )}
      {!showFileLink && !showSourceLink && !isFile && !target.componentName && (
        <p className="mt-1.5 text-[11.5px] italic text-ip-text-muted">No React component detected</p>
      )}
    </section>
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
