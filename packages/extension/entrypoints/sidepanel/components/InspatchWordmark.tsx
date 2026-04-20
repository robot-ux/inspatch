import type { SVGProps } from "react";

// Brand accent — mirrors --ip-text-accent in style.css. Hardcoded here because
// SVG stroke attributes don't resolve CSS custom properties via var() in all
// contexts; keep in sync with the CSS token if the brand palette ever changes.
const BRAND_ACCENT = "#a3a6ff";

type MarkProps = SVGProps<SVGSVGElement> & {
  size?: number;
  color?: string;
  accent?: string;
};

export function InspatchMark({
  size = 20,
  color = "currentColor",
  accent,
  ...rest
}: MarkProps) {
  const crossColor = accent ?? color;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <g stroke={color} strokeWidth={20} strokeLinecap="square" fill="none">
        <polyline points="34,72 34,34 72,34" />
        <polyline points="168,34 206,34 206,72" />
        <polyline points="34,168 34,206 72,206" />
        <polyline points="206,168 206,206 168,206" />
      </g>
      <g stroke={crossColor} strokeWidth={20} strokeLinecap="square">
        <line x1="120" y1="86" x2="120" y2="154" />
        <line x1="86" y1="120" x2="154" y2="120" />
      </g>
    </svg>
  );
}

interface WordmarkProps {
  size?: "sm" | "md";
  className?: string;
}

export function InspatchWordmark({ size = "md", className }: WordmarkProps) {
  const markSize = size === "sm" ? 14 : 18;
  const textClass =
    size === "sm"
      ? "text-[12px] font-semibold tracking-tight"
      : "text-[13px] font-semibold tracking-tight";
  return (
    <span
      className={["inline-flex items-center gap-1.5 text-ip-text-primary", className]
        .filter(Boolean)
        .join(" ")}
    >
      <InspatchMark size={markSize} accent={BRAND_ACCENT} />
      <span className={textClass}>inspatch</span>
    </span>
  );
}
