import type { Components } from "react-markdown";

export const mdComponents: Components = {
  p: ({ children }) => (
    <p className="text-[12px] leading-relaxed text-ip-text-secondary">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ip-text-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-ip-text-secondary">{children}</em>,
  code: ({ children, className }) => {
    const isBlock = !!className;
    if (isBlock) {
      return (
        <code className="mt-1 block overflow-x-auto whitespace-pre rounded-ip-sm bg-ip-bg-primary p-2 font-code text-[11px] text-ip-text-secondary">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded px-1 py-0.5 font-code text-[11px] text-ip-text-accent bg-ip-bg-primary">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mt-1">{children}</pre>,
  ul: ({ children }) => (
    <ul className="list-disc list-outside space-y-0.5 pl-3 marker:text-ip-text-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside space-y-0.5 pl-3 marker:text-ip-text-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[12px] leading-relaxed text-ip-text-secondary">{children}</li>
  ),
  h1: ({ children }) => (
    <h1 className="text-[13px] font-semibold text-ip-text-primary">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[13px] font-semibold text-ip-text-primary">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[12px] font-semibold text-ip-text-primary">{children}</h3>
  ),
};
