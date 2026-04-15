import { useState, useEffect, useCallback, useRef } from 'react'
import type { ElementSelection, ChangeRequest, StatusUpdate, ChangeResult, ConsoleError } from '@inspatch/shared'

function pendingStorageKey(tabId: number) { return `pending_${tabId}` }
import { useWebSocket } from './hooks/useWebSocket'
import { ChangeInput } from './components/ChangeInput'
import { ProcessingStatus } from './components/ProcessingStatus'
import { HeaderBar, type EditorChoice } from './components/HeaderBar'
import { NotLocalhost } from './components/NotLocalhost'
import { EmptyState } from './components/EmptyState'
import { StatusGuide } from './components/StatusGuide'
import { ElementCard } from './components/ElementCard'
import { CrosshairIcon } from './components/icons'

type SidebarState = 'idle' | 'inspecting' | 'selected'

function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  } catch {
    return false
  }
}

export default function App() {
  const { status, lastMessage, send, reconnect } = useWebSocket('ws://localhost:9377')
  const [sidebarState, setSidebarState] = useState<SidebarState>('idle')
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<StatusUpdate | null>(null)
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const activeRequestId = useRef<string | null>(null)
  const activeTabId = useRef<number | null>(null)
  // the specific tab being inspected — only reset state when THIS tab reloads
  const inspectTabId = useRef<number | null>(null)
  const [isLocalhost, setIsLocalhost] = useState(true)
  const [editor, setEditor] = useState<EditorChoice>('cursor')
  const [consoleErrors, setConsoleErrors] = useState<ConsoleError[]>([])
  const [errorsExpanded, setErrorsExpanded] = useState(false)
  const [statusLog, setStatusLog] = useState<string[]>([])
  // tracks whether the user has ever clicked "Start Inspect" in this session
  const [hasUsedInspect, setHasUsedInspect] = useState(false)

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'status_update') {
      const su = lastMessage as StatusUpdate
      if (activeRequestId.current && su.requestId && su.requestId !== activeRequestId.current) return
      setProcessing(su)
      if (su.status !== 'complete' && su.status !== 'error') {
        setStatusLog(prev => [...prev, su.message])
      }
      if (su.streamText) {
        setStreamedText((prev) => prev + su.streamText)
      }
    } else if (lastMessage.type === 'change_result') {
      const cr = lastMessage as ChangeResult
      if (activeRequestId.current && cr.requestId && cr.requestId !== activeRequestId.current) return
      setChangeResult(cr)
      setProcessing(null)
      activeRequestId.current = null
      if (activeTabId.current) chrome.storage.local.remove(pendingStorageKey(activeTabId.current))
    } else if (lastMessage.type === 'resume_not_found') {
      // server was restarted; stale pending state — clear everything
      if (activeTabId.current) chrome.storage.local.remove(pendingStorageKey(activeTabId.current))
      setProcessing(null)
      setSelectedElement(null)
      setHasUsedInspect(false)
      activeRequestId.current = null
    }
  }, [lastMessage])

  const sendToContentScript = useCallback(async (message: { type: string }) => {
    setError(null)
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (!tab?.id) {
      setError('No active tab found')
      return
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message)
    } catch {
      setError('Content script not loaded — refresh the localhost page and try again')
      throw new Error('Content script not available')
    }
  }, [])

  useEffect(() => {
    chrome.storage.local.get('editor').then(({ editor }) => {
      if (editor === 'cursor' || editor === 'vscode') setEditor(editor)
    })
  }, [])

  const handleEditorChange = useCallback((next: EditorChoice) => {
    setEditor(next)
    chrome.storage.local.set({ editor: next })
  }, [])

  // on reconnect, check if there's a pending request for this tab and resume it
  useEffect(() => {
    if (status !== 'connected') return
    const tabId = activeTabId.current
    if (!tabId) return
    const key = pendingStorageKey(tabId)
    chrome.storage.local.get(key).then(data => {
      const pending = data[key] as { requestId: string; element: ElementSelection } | undefined
      if (!pending) return
      setSelectedElement(pending.element)
      setHasUsedInspect(true)
      setSidebarState('idle')
      activeRequestId.current = pending.requestId
      inspectTabId.current = tabId
      setProcessing({
        type: 'status_update',
        requestId: pending.requestId,
        status: 'analyzing',
        message: 'Reconnecting…',
      })
      send({ type: 'resume', requestId: pending.requestId })
    })
  }, [status, send])

  useEffect(() => {
    // when tabId is known use tabs.get — avoids lastFocusedWindow ambiguity
    const checkTab = async (tabId?: number) => {
      let tab: chrome.tabs.Tab | undefined
      if (tabId !== undefined) {
        try { tab = await chrome.tabs.get(tabId) } catch { return }
      } else {
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        tab = t
      }
      if (tab?.id) activeTabId.current = tab.id
      // only update for http/https — chrome-extension://, chrome://, about: etc.
      // (e.g. wallet popups) must not flip the localhost detection state
      if (tab?.url?.startsWith('http')) setIsLocalhost(isLocalhostUrl(tab.url))
    }
    checkTab()

    const onActivated = ({ tabId }: { tabId: number }) => {
      activeTabId.current = tabId
      checkTab(tabId)
    }
    // only react to the active tab — background tab updates are irrelevant
    const onUpdated = (tabId: number, info: { url?: string; status?: string }) => {
      if (tabId !== activeTabId.current) return
      if (info.url !== undefined || info.status === 'complete') checkTab(tabId)
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  useEffect(() => {
    const listener = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message) {
        const msg = message as { type: string }
        if (msg.type === 'element_selection') {
          setSelectedElement(message as ElementSelection)
          setSidebarState('idle')
          inspectTabId.current = activeTabId.current
        } else if (msg.type === 'inspect-stopped') {
          setSidebarState('idle')
        } else if (msg.type === 'console_error') {
          const err = message as ConsoleError & { type: string }
          setConsoleErrors(prev => [...prev.slice(-19), {
            message: err.message,
            stack: err.stack,
            timestamp: err.timestamp,
          }])
        }
      }
    }
    chrome.runtime.onMessage.addListener(listener)

    const onTabUpdated = (
      tabId: number,
      changeInfo: { status?: string },
    ) => {
      // only reset when the tab being inspected reloads, not any other tab
      if (changeInfo.status === 'loading' && tabId === inspectTabId.current) {
        inspectTabId.current = null
        setSelectedElement(null)
        setSidebarState('idle')
        setError(null)
        setProcessing(null)
        setChangeResult(null)
        setStreamedText('')
        setConsoleErrors([])
        setErrorsExpanded(false)
        setStatusLog([])
        setHasUsedInspect(false)
        activeRequestId.current = null
      }
    }
    chrome.tabs.onUpdated.addListener(onTabUpdated)

    return () => {
      chrome.runtime.onMessage.removeListener(listener)
      chrome.tabs.onUpdated.removeListener(onTabUpdated)
    }
  }, [])

  const handleStartInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'start-inspect' })
      setSidebarState('inspecting')
      setHasUsedInspect(true)
      inspectTabId.current = activeTabId.current
    } catch { /* error already set */ }
  }, [sendToContentScript])

  const handleStopInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'stop-inspect' })
    } catch { /* ignore */ }
    setSidebarState('idle')
  }, [sendToContentScript])

  const handleClear = useCallback(async () => {
    if (sidebarState === 'inspecting') {
      try { await sendToContentScript({ type: 'stop-inspect' }) } catch { /* ignore */ }
    }
    setSidebarState('idle')
    setSelectedElement(null)
    setProcessing(null)
    setChangeResult(null)
    setStreamedText('')
    setStatusLog([])
    setConsoleErrors([])
    setErrorsExpanded(false)
    activeRequestId.current = null
    inspectTabId.current = null
    if (activeTabId.current) chrome.storage.local.remove(pendingStorageKey(activeTabId.current))
  }, [sidebarState, sendToContentScript])

  const handleElementHover = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'highlight-element' })
    } catch { /* ignore */ }
  }, [sendToContentScript])

  const handleElementLeave = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'clear-highlight' })
    } catch { /* ignore */ }
  }, [sendToContentScript])

  const handleSendChange = useCallback((description: string, imageDataUrl?: string) => {
    if (!selectedElement) return
    const requestId = crypto.randomUUID()
    activeRequestId.current = requestId
    setProcessing(null)
    setChangeResult(null)
    setStreamedText('')
    setStatusLog([])

    const changeRequest: ChangeRequest = {
      type: 'change_request',
      requestId,
      description,
      elementXpath: selectedElement.xpath,
      componentName: selectedElement.componentName,
      parentChain: selectedElement.parentChain,
      sourceFile: selectedElement.sourceFile,
      sourceLine: selectedElement.sourceLine,
      sourceColumn: selectedElement.sourceColumn,
      screenshotDataUrl: imageDataUrl,
      boundingRect: selectedElement.boundingRect,
      computedStyles: selectedElement.computedStyles,
      consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
    }
    send(changeRequest)
    // persist so the task can be resumed if the sidepanel is closed mid-flight
    if (activeTabId.current) {
      chrome.storage.local.set({
        [pendingStorageKey(activeTabId.current)]: { requestId, element: selectedElement },
      })
    }
    setConsoleErrors([])
    setErrorsExpanded(false)
  }, [selectedElement, consoleErrors, send])

  const showCompactHeader = hasUsedInspect || !!selectedElement || sidebarState !== 'idle'

  if (!isLocalhost) {
    return (
      <div className="flex flex-col h-screen bg-ip-bg-primary">
        <HeaderBar status={status} editor={editor} onReconnect={reconnect} onEditorChange={handleEditorChange} />
        <NotLocalhost />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-ip-bg-primary">
      <HeaderBar
        status={status}
        editor={editor}
        onReconnect={reconnect}
        onEditorChange={handleEditorChange}
        compact={showCompactHeader}
        isInspecting={sidebarState === 'inspecting'}
        hasSelectedElement={!!selectedElement}
        inspectDisabled={status !== 'connected'}
        onInspect={sidebarState === 'inspecting' ? handleStopInspect : handleStartInspect}
        onClear={handleClear}
      />

      {error && (
        <div className="px-4 py-2 bg-ip-warning-muted border-b border-[rgba(245,158,11,0.3)] animate-slide-down">
          <p className="text-[11px] text-ip-warning">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* Initial state: not yet used inspect */}
        {!hasUsedInspect && !selectedElement && sidebarState === 'idle' && (
          status !== 'connected'
            ? <StatusGuide onReconnect={reconnect} />
            : (
              <div className="flex flex-col items-center justify-center h-full px-6 gap-7">
                {/* Workflow steps */}
                <div className="w-full flex flex-col gap-4">
                  {([
                    { num: '01', title: 'Inspect an element', body: 'Click any DOM node on your localhost page' },
                    { num: '02', title: 'Describe the change', body: 'Type a prompt or paste a screenshot' },
                    { num: '03', title: 'Claude edits your code', body: 'Source file updated live in your editor' },
                  ] as const).map(({ num, title, body }, i) => (
                    <div
                      key={num}
                      className="flex items-start gap-3 animate-fade-in"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="text-[10px] font-code text-ip-border-muted mt-[3px] flex-shrink-0 w-5 select-none">{num}</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] text-ip-text-secondary font-medium leading-tight">{title}</span>
                        <span className="text-[11px] text-ip-text-muted leading-snug">{body}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="w-full h-px bg-ip-border-subtle opacity-60 animate-fade-in" style={{ animationDelay: '200ms' }} />

                {/* CTA */}
                <div
                  className="flex flex-col items-center gap-2.5 animate-fade-in"
                  style={{ animationDelay: '240ms' }}
                >
                  <button
                    onClick={handleStartInspect}
                    className="flex items-center gap-2 px-6 py-2.5 bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 hover:shadow-ip-glow-accent active:scale-95 text-white text-[13px] font-semibold rounded-ip-lg transition-all duration-150 shadow-ip-card"
                  >
                    <CrosshairIcon className="w-4 h-4" />
                    Start Inspect
                  </button>
                  <p className="text-[11px] text-ip-text-muted tracking-wide">Click any element on the page</p>
                </div>
              </div>
            )
        )}

        {/* Inspecting state */}
        {sidebarState === 'inspecting' && <EmptyState state="inspecting" />}

        {/* After first use: idle, no element */}
        {hasUsedInspect && sidebarState === 'idle' && !selectedElement && (
          status !== 'connected'
            ? <StatusGuide onReconnect={reconnect} />
            : <EmptyState state="idle" />
        )}

        {/* Element selected */}
        {selectedElement && sidebarState !== 'inspecting' && (
          <ElementCard
            element={selectedElement}
            editor={editor}
            onHover={handleElementHover}
            onLeave={handleElementLeave}
          />
        )}

        {selectedElement && sidebarState !== 'inspecting' && (processing || changeResult) && (
          <div className="mt-3 animate-fade-in-scale">
            <ProcessingStatus
              statusUpdate={processing}
              changeResult={changeResult}
              streamedText={streamedText}
              statusLog={statusLog}
              onRetry={() => {
                setProcessing(null)
                setChangeResult(null)
                setStreamedText('')
                setStatusLog([])
                activeRequestId.current = null
              }}
            />
          </div>
        )}
      </div>

      {selectedElement && sidebarState !== 'inspecting' && !selectedElement.sourceFile && (
        <div className="px-4 py-2 bg-ip-warning-muted border-t border-[rgba(245,158,11,0.3)]">
          <p className="text-[11px] text-ip-warning">
            No source file detected — changes may require manual file lookup.
            Ensure your dev server has source maps enabled.
          </p>
        </div>
      )}

      {consoleErrors.length > 0 && selectedElement && sidebarState !== 'inspecting' && !processing && (
        <div className="px-3 pb-2">
          <div className="rounded-ip-md border border-[rgba(239,68,68,0.3)] bg-ip-error-muted overflow-hidden">
            <button
              onClick={() => setErrorsExpanded(e => !e)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px]"
            >
              <span className="text-ip-error font-medium">
                ⚠ {consoleErrors.length} console error{consoleErrors.length > 1 ? 's' : ''} — will be sent to Claude
              </span>
              <span className="flex items-center gap-2 text-ip-text-muted">
                <span
                  onClick={e => { e.stopPropagation(); setConsoleErrors([]); setErrorsExpanded(false) }}
                  className="hover:text-ip-error transition-colors"
                >
                  clear
                </span>
                <span>{errorsExpanded ? '▲' : '▼'}</span>
              </span>
            </button>
            {errorsExpanded && (
              <div className="border-t border-[rgba(239,68,68,0.2)] max-h-28 overflow-y-auto">
                {consoleErrors.slice(-5).map((err, i) => (
                  <div
                    key={i}
                    className="px-3 py-1.5 text-[10px] font-code text-ip-text-secondary border-b border-[rgba(239,68,68,0.1)] last:border-0 truncate"
                    title={err.message}
                  >
                    {err.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedElement && sidebarState !== 'inspecting' && (
        <ChangeInput
          onSend={handleSendChange}
          disabled={status !== 'connected' || !!processing}
        />
      )}
    </div>
  )
}
