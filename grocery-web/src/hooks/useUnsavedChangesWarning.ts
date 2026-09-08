import { useEffect } from 'react'

/**
 * Warns before the tab is closed or reloaded with unsaved edits.
 *
 * Only covers browser-level navigation. In-app navigation is guarded at the
 * call site instead, because `useBlocker` requires a data router and this app
 * uses `<BrowserRouter>`; migrating the router for one confirmation would be a
 * disproportionate change.
 */
export function useUnsavedChangesWarning(when: boolean) {
  useEffect(() => {
    if (!when) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Browsers show their own wording; a non-empty returnValue is what
      // actually triggers the prompt in older engines.
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}
