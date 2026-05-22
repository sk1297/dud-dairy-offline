import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Pull-to-refresh hook for Android-style swipe-down to reload.
 * Attach the returned ref to the scrollable container div.
 * onRefresh — async function to call when user pulls down.
 *
 * FIX: touchmove is now passive:true — NEVER blocks native scroll.
 * We toggle touch-action + overflow on the element itself only when
 * the user is clearly pulling (dist > 8px from top), so normal
 * downward scroll is never intercepted.
 */
export default function usePullToRefresh(onRefresh, threshold = 65) {
  const containerRef = useRef(null)
  const [pulling,    setPulling]    = useState(false)
  const [pullDist,   setPullDist]   = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const startY      = useRef(0)
  const startScroll = useRef(0)
  const isPulling   = useRef(false)
  const pullDistRef = useRef(0) // mirror of pullDist for use inside async handlers

  // keep ref in sync with state
  useEffect(() => { pullDistRef.current = pullDist }, [pullDist])

  const restoreScroll = useCallback((el) => {
    if (!el) return
    el.style.touchAction = ''
    el.style.overflowY   = ''
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e) => {
      startY.current      = e.touches[0].clientY
      startScroll.current = el.scrollTop
      isPulling.current   = false
    }

    // passive:true — browser never has to wait before scrolling
    const onTouchMove = (e) => {
      if (refreshing) return
      const dist      = e.touches[0].clientY - startY.current
      const atTop     = startScroll.current === 0

      if (dist > 8 && atTop) {
        if (!isPulling.current) {
          isPulling.current    = true
          // Block native scroll only while user is pulling downward from top
          el.style.overflowY   = 'hidden'
          el.style.touchAction = 'none'
        }
        setPulling(true)
        setPullDist(Math.min(dist * 0.45, threshold + 20))
      }
    }

    const onTouchEnd = async () => {
      if (!isPulling.current) {
        restoreScroll(el)
        return
      }
      const dist = pullDistRef.current
      if (dist >= threshold) {
        setRefreshing(true)
        setPullDist(threshold)
        try { await onRefresh() } catch (_) {}
        setRefreshing(false)
      }
      setPulling(false)
      setPullDist(0)
      isPulling.current = false
      restoreScroll(el)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: true })  // ← key fix
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
      restoreScroll(el)
    }
  }, [onRefresh, refreshing, threshold, restoreScroll])

  const indicator = (pulling || refreshing) ? (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      transform: `translateY(${pullDist - 40}px)`,
      transition: pulling ? 'none' : 'transform 0.3s ease',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '50%', width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
          style={{
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            transform: !refreshing
              ? `rotate(${(pullDist / threshold) * 360}deg)`
              : undefined,
          }}>
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
      </div>
    </div>
  ) : null

  return { containerRef, indicator, refreshing }
}
