import type { SVGProps } from "react";

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
