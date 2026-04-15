import { useState } from 'react'
import type { ElementSelection } from '@inspatch/shared'
import type { EditorChoice } from './HeaderBar'
import { ChevronIcon } from './icons'

interface ElementCardProps {
  element: ElementSelection
  editor: EditorChoice
  onHover: () => void
  onLeave: () => void
}

export function ElementCard({ element, editor, onHover, onLeave }: ElementCardProps) {
  const [chainExpanded, setChainExpanded] = useState(false)

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
              const chain = element.parentChain!
              // collapsed: show abbreviated path (last 3 segments with leading "…")
              const isLong = chain.length > 3
              const displayChain = !chainExpanded && isLong ? chain.slice(-3) : chain

              return (
                <button
                  onClick={e => { e.stopPropagation(); setChainExpanded(v => !v) }}
                  className="w-full text-left group"
                  title={chainExpanded ? 'Collapse' : 'Expand full chain'}
                >
                  <p className="text-[11px] font-code text-ip-text-muted flex items-center gap-1 flex-wrap">
                    {!chainExpanded && isLong && (
                      <span className="text-ip-border-muted">…</span>
                    )}
                    {displayChain.map((name, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-ip-border-muted">{'>'}</span>}
                        <span className={i === displayChain.length - 1 ? 'text-ip-text-secondary' : 'text-ip-text-muted'}>
                          {name}
                        </span>
                      </span>
                    ))}
                    {isLong && (
                      <ChevronIcon
                        up={chainExpanded}
                        className="w-3 h-3 text-ip-text-muted group-hover:text-ip-text-secondary transition-colors ml-0.5 flex-shrink-0"
                      />
                    )}
                  </p>
                </button>
              )
            })()}

            {element.sourceFile && (() => {
              const parts = element.sourceFile!.split('/')
              const truncated = parts.length > 3
                ? '…/' + parts.slice(-3).join('/')
                : element.sourceFile!
              const label = `${truncated}${element.sourceLine ? `:${element.sourceLine}` : ''}`
              const openInEditor = (e: React.MouseEvent) => {
                e.stopPropagation()
                const params = new URLSearchParams({ file: element.sourceFile!, editor })
                if (element.sourceLine) params.set('line', String(element.sourceLine))
                if (element.sourceColumn) params.set('column', String(element.sourceColumn))
                fetch(`http://localhost:9377/open-in-editor?${params}`).catch(() => {})
              }
              return (
                <button
                  onClick={openInEditor}
                  className="text-[12px] font-code text-ip-success truncate text-left hover:underline hover:text-ip-success/80 transition-colors"
                  title={`${element.sourceFile} — click to open in editor`}
                >
                  {label}
                </button>
              )
            })()}
          </>
        ) : (
          <p className="text-[12px] text-ip-text-muted italic">No React component detected</p>
        )}
      </div>
    </div>
  )
}
