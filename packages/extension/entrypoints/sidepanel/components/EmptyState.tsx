import { CrosshairIcon } from "./icons";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 py-10 text-center animate-fade-in">
      <div className="relative flex h-[84px] w-[84px] items-center justify-center">
        <span
          className="absolute inset-0 rounded-ip-lg border border-dashed border-ip-border-muted bg-ip-bg-card"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -inset-[1px] rounded-ip-lg border border-ip-border-accent opacity-30 animate-soft-pulse"
          aria-hidden="true"
        />
        <CrosshairIcon size={36} className="relative text-ip-text-accent" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight text-ip-text-primary">
          Inspecting&hellip;
        </span>
        <span className="max-w-[280px] text-[12px] leading-snug text-ip-text-muted">
          Click any DOM node on your localhost page.
        </span>
      </div>
    </div>
  );
}
