import type { ReactNode } from "react";

export type PillTone = "neutral" | "accent" | "success" | "warning" | "error" | "info";

interface PillProps {
  tone?: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}

const TONE: Record<PillTone, string> = {
  neutral: "bg-ip-bg-tertiary/60 text-ip-text-secondary border-ip-border-muted",
  accent: "bg-ip-info-muted text-ip-text-accent border-ip-border-accent",
  success: "bg-ip-success-muted text-ip-success border-transparent",
  warning: "bg-ip-warning-muted text-ip-warning border-transparent",
  error: "bg-ip-error-muted text-ip-error border-transparent",
  info: "bg-ip-info-muted text-ip-text-accent border-transparent",
};

export function Pill({ tone = "neutral", icon, children, className, title }: PillProps) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-medium leading-none tracking-tight",
        TONE[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}
