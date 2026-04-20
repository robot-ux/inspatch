import type { ReactNode } from "react";

interface FooterMetaProps {
  left?: ReactNode;
  right?: ReactNode;
  mono?: boolean;
}

export function FooterMeta({ left, right, mono = true }: FooterMetaProps) {
  return (
    <footer
      className={[
        "mt-auto flex flex-none items-center justify-between border-t border-ip-border-subtle bg-ip-bg-secondary/50 px-3.5 py-2 text-[10px] text-ip-text-muted",
        mono ? "font-code" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="truncate">{left}</span>
      {right ? <span className="ml-2 inline-flex flex-none items-center gap-1.5">{right}</span> : null}
    </footer>
  );
}
