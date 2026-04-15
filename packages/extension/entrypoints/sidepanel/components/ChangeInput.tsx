import { useState, useCallback, useRef, type KeyboardEvent, type ClipboardEvent } from 'react'
import { SendIcon } from './icons'

interface ChangeInputProps {
  onSend: (description: string, imageDataUrl?: string) => void
  disabled?: boolean
}

function readImageFromClipboard(item: DataTransferItem): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = item.getAsFile()
    if (!blob) return reject(new Error('No file in clipboard'))
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

const MAX_HEIGHT = 120

export function ChangeInput({ onSend, disabled }: ChangeInputProps) {
  const [value, setValue] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = value.trim()
  const canSend = (trimmed.length > 0 || !!imageDataUrl) && !disabled

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_HEIGHT)
    el.style.height = `${next}px`
    // only show scrollbar when content exceeds max height
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    adjustHeight()
  }, [adjustHeight])

  const handleSend = useCallback(() => {
    if (!canSend) return
    onSend(trimmed || '(see attached screenshot)', imageDataUrl ?? undefined)
    setValue('')
    setImageDataUrl(null)
    // reset height and hide scrollbar after clearing value
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.style.overflowY = 'hidden'
      }
    })
  }, [canSend, trimmed, imageDataUrl, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        try {
          const dataUrl = await readImageFromClipboard(item)
          setImageDataUrl(dataUrl)
        } catch { /* ignore read failures */ }
        return
      }
    }
  }, [])

  const removeImage = useCallback(() => setImageDataUrl(null), [])

  return (
    <div className="border-t border-ip-border-subtle px-3 pt-2 pb-3 bg-ip-bg-secondary animate-slide-up">
      {imageDataUrl && (
        <div className="relative mb-2 inline-block animate-fade-in-scale">
          <img
            src={imageDataUrl}
            alt="Pasted screenshot"
            className="max-h-28 rounded-ip-md border border-ip-border-subtle object-contain"
          />
          <button
            onClick={removeImage}
            aria-label="Remove image"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-ip-bg-tertiary hover:bg-ip-text-muted text-white text-xs rounded-full leading-none"
            title="Remove image"
          >
            &times;
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          rows={2}
          placeholder={'Describe the change… (⌘V to paste screenshot)'}
          className="flex-1 resize-none rounded-ip-md border border-ip-border-subtle bg-ip-bg-input px-3 py-2 text-[13px] text-ip-text-primary focus:outline-none focus:ring-2 focus:ring-[rgba(99,102,241,0.2)] focus:border-ip-border-accent placeholder:text-ip-text-muted disabled:opacity-50 disabled:cursor-not-allowed leading-5"
          style={{ minHeight: '52px', maxHeight: `${MAX_HEIGHT}px`, overflowY: 'hidden' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          title="Send (Enter)"
          className={`w-9 h-9 flex items-center justify-center rounded-ip-md flex-shrink-0 transition-all duration-150 ${
            canSend
              ? 'bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 hover:scale-105 active:scale-95 text-white shadow-ip-card'
              : 'opacity-40 bg-ip-bg-tertiary text-ip-text-muted cursor-not-allowed'
          }`}
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-ip-text-muted/50 mt-1.5 text-center select-none">
        ↵ Send · ⇧↵ New line
      </p>
    </div>
  )
}
