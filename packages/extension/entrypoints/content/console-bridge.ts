import { createLogger } from '@inspatch/shared'

const logger = createLogger('console-bridge')

export function initConsoleBridge(): () => void {
  const scriptUrl = chrome.runtime.getURL('console-main-world.js')
  const script = document.createElement('script')
  script.src = scriptUrl
  script.onerror = () => logger.warn('Console bridge script failed to load')
  ;(document.head || document.documentElement).appendChild(script)

  const handleError = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      message: string
      stack?: string
      timestamp: number
    }
    chrome.runtime.sendMessage({
      type: 'console_error',
      message: detail.message,
      stack: detail.stack,
      timestamp: detail.timestamp,
    }).catch(() => {})
  }

  window.addEventListener('inspatch:console-error', handleError)

  return () => window.removeEventListener('inspatch:console-error', handleError)
}
