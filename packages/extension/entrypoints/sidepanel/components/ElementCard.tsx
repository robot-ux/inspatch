import type { ElementSelection } from '@inspatch/shared';

interface ElementCardProps {
  element: ElementSelection;
  onHover: () => void;
  onLeave: () => void;
}

export function ElementCard({ element, onHover, onLeave }: ElementCardProps) {
  return (
    <div
      className="bg-ip-bg-card rounded-ip-lg border border-ip-border-subtle p-4 space-y-2 cursor-pointer hover:border-ip-border-accent hover:shadow-ip-glow-accent transition-all duration-200 shadow-ip-card animate-slide-up"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[16px] font-code font-semibold text-ip-text-primary">
          {element.tagName}
        </span>
        <span className="text-[12px] font-code text-ip-text-muted">
          {element.boundingRect.width}×{element.boundingRect.height}
        </span>
      </div>

      {element.id && (
        <p className="text-[13px] font-code text-ip-text-accent">#{element.id}</p>
      )}

      {element.className && (
        <p className="text-[12px] font-code text-ip-text-secondary">
          {element.className.split(/\s+/).filter(Boolean).map(c => `.${c}`).join(' ')}
        </p>
      )}

      <p className="text-[11px] font-code text-ip-text-muted truncate" title={element.xpath}>
        {element.xpath}
      </p>

      <div className="border-t border-ip-border-subtle pt-2 mt-2 space-y-1.5">
        {element.componentName ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-ip-text-muted">&lt;/&gt;</span>
              <span className="text-[13px] font-code font-semibold text-[#C084FC]">
                {element.componentName}
              </span>
            </div>
            {element.parentChain && element.parentChain.length > 1 && (() => {
              const chain = element.parentChain!;
              const display = chain.length > 5 ? chain.slice(-4) : chain;
              return (
                <p className="text-[11px] font-code text-ip-text-muted truncate">
                  {chain.length > 5 && <span>… {'>'} </span>}
                  {display.map((name, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-ip-border-muted"> {'>'} </span>}
                      <span className="text-ip-text-muted">{name}</span>
                    </span>
                  ))}
                </p>
              );
            })()}
            {element.sourceFile && (() => {
              const parts = element.sourceFile!.split('/');
              const truncated = parts.length > 3
                ? '…/' + parts.slice(-3).join('/')
                : element.sourceFile!;
              return (
                <p className="text-[12px] font-code text-ip-success truncate" title={element.sourceFile}>
                  {truncated}{element.sourceLine ? `:${element.sourceLine}` : ''}
                </p>
              );
            })()}
          </>
        ) : (
          <p className="text-[12px] text-ip-text-muted italic">No React component detected</p>
        )}
      </div>
    </div>
  );
}
