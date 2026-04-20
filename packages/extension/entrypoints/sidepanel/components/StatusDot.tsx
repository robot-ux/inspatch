export type DotTone = "success" | "warning" | "error" | "accent" | "muted";
export type DotAnim = "ping" | "pulse" | "none";

interface StatusDotProps {
  tone: DotTone;
  anim?: DotAnim;
  size?: 6 | 8 | 10;
}

const TONE_BG: Record<DotTone, string> = {
  success: "bg-ip-success",
  warning: "bg-ip-warning",
  error: "bg-ip-error",
  accent: "bg-ip-text-accent",
  muted: "bg-ip-text-muted",
};

export function StatusDot({ tone, anim = "none", size = 8 }: StatusDotProps) {
  const dim = `${size}px`;
  return (
    <span
      className="relative inline-flex flex-none"
      style={{ width: dim, height: dim }}
    >
      {anim === "ping" && (
        <span
          className={`absolute inset-0 inline-flex animate-ping rounded-full opacity-50 ${TONE_BG[tone]}`}
        />
      )}
      {anim === "pulse" && (
        <span
          className={`absolute inset-0 inline-flex animate-soft-pulse rounded-full ${TONE_BG[tone]}`}
        />
      )}
      <span className={`relative inline-flex h-full w-full rounded-full ${TONE_BG[tone]}`} />
    </span>
  );
}
