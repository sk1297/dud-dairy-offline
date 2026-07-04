import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient.js'
import { syncNow } from './syncService.js'
import { getSetting } from '../services/settingsService.js'
import { isDirty, clearDirty, markDirty } from './dirty.js'

// ── Smart background sync ──────────────────────────────────────────────────────
// Pushes local data to the cloud whenever it has changed (dirty flag) so the
// customer app sees updates within seconds — without wasteful uploads when
// nothing changed. Triggers:
//   • a short poll (every ~8s) that syncs only if dirty  → near "on-save"
//   • when the app returns to the foreground / reconnects
// Only runs when the owner is signed into cloud and has completed setup.
const POLL_MS = 8000
const MIN_GAP = 6000

export function useAutoSync() {
  const lastRun = useRef(0)
  const running = useRef(false)

  useEffect(() => {
    let timer
    let cancelled = false

    const trySync = async ({ force = false } = {}) => {
      if (cancelled || running.current) return
      if (!force && !isDirty()) return
      if (Date.now() - lastRun.current < MIN_GAP) return
      if (!navigator.onLine) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        if (!(await getSetting('cloud_dairy_id'))) return
        running.current = true
        lastRun.current = Date.now()
        clearDirty()                 // capture; new changes re-mark during sync
        await syncNow()
      } catch {
        markDirty()                  // failed → retry on next tick
      } finally {
        running.current = false
      }
    }

    trySync({ force: true })                 // initial sync
    timer = setInterval(() => trySync(), POLL_MS)

    const onVisible = () => { if (document.visibilityState === 'visible') trySync({ force: true }) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', () => trySync({ force: true }))

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
