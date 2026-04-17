import { CrosshairIcon } from "./icons";

interface EmptyStateProps {
  variant: "inspecting" | "idle";
}

export function EmptyState({ variant }: EmptyStateProps) {
  const inspecting = variant === "inspecting";
  const title = inspecting ? "Inspecting…" : "No element selected";
  const hint = inspecting
    ? "Click a DOM node on your localhost page"
    : "Hit Inspect to pick a new target";
  const iconTone = inspecting ? "text-ip-text-accent" : "text-ip-text-muted";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center animate-fade-in">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card ${iconTone}`}
      >
        <CrosshairIcon size={18} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-ip-text-primary">{title}</span>
        <span className="text-[11px] text-ip-text-muted">{hint}</span>
      </div>
    </div>
  );
}
