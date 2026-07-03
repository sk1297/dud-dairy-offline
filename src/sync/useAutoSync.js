import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient.js'
import { syncNow } from './syncService.js'
import { getSetting } from '../services/settingsService.js'

// ── Background auto-sync ───────────────────────────────────────────────────────
// Silently pushes local data to the cloud when the owner is signed in and has
// synced at least once (a cloud_dairy_id exists). Triggers:
//   • on app start / this hook mounting
//   • when the app returns to the foreground (visibility change)
//   • every 3 hours while running
// All failures are swallowed — sync is best-effort and never blocks the UI.
const THREE_HOURS = 3 * 60 * 60 * 1000
const MIN_GAP     = 2 * 60 * 1000   // don't sync more than once per 2 min

export function useAutoSync() {
  const lastRun = useRef(0)

  useEffect(() => {
    let timer
    let cancelled = false

    const trySync = async () => {
      if (cancelled) return
      if (Date.now() - lastRun.current < MIN_GAP) return
      try {
        if (!navigator.onLine) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return                       // owner not signed into cloud
        if (!(await getSetting('cloud_dairy_id'))) return  // never set up yet
        lastRun.current = Date.now()
        await syncNow()
      } catch { /* best-effort */ }
    }

    // Initial + interval
    trySync()
    timer = setInterval(trySync, THREE_HOURS)

    // Foreground
    const onVisible = () => { if (document.visibilityState === 'visible') trySync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', trySync)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', trySync)
    }
  }, [])
}
