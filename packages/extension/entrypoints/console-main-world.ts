export default defineUnlistedScript(() => {
  function dispatch(message: string, stack?: string) {
    window.dispatchEvent(
      new CustomEvent('inspatch:console-error', {
        detail: { message, stack, timestamp: Date.now() },
      })
    )
  }

  // Hook console.error
  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)
    const message = args
      .map(a => {
        if (a instanceof Error) return a.message
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a) } catch { return String(a) }
        }
        return String(a)
      })
      .join(' ')
    const stack = args.find((a): a is Error => a instanceof Error)?.stack
    dispatch(message, stack)
  }

  // Hook uncaught errors
  const originalOnerror = window.onerror
  window.onerror = (msg, source, lineno, colno, error) => {
    dispatch(
      typeof msg === 'string' ? msg : 'Script error',
      error?.stack,
    )
    return originalOnerror ? originalOnerror(msg, source, lineno, colno, error) : false
  }

  // Hook unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const message = reason instanceof Error
      ? reason.message
      : String(reason ?? 'Unknown rejection')
    dispatch(
      `Unhandled Promise Rejection: ${message}`,
      reason instanceof Error ? reason.stack : undefined,
    )
  })
})
