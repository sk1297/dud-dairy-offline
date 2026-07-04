// ── Change tracking ───────────────────────────────────────────────────────────
// Any local DB mutation flips this flag on. The auto-sync loop pushes to the
// cloud only when it's set, then clears it — so a 1-min-ish timer stays cheap
// (no upload when nothing changed) yet reacts within seconds of any save.
let _dirty = true   // start dirty so the first run performs an initial sync

export const markDirty  = () => { _dirty = true }
export const isDirty    = () => _dirty
export const clearDirty = () => { _dirty = false }
