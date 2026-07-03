// ── Supabase client (owner app) ───────────────────────────────────────────────
// The publishable key is safe to ship in the APK. It grants NO data access on
// its own — every request is still gated by Row Level Security. The owner must
// sign in (email + password) before they can write their dairy's data.
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL  = 'https://nwlabdjuksvrtoxwozqs.supabase.co'
export const SUPABASE_KEY  = 'sb_publishable_VHHsO-rMdWuDLbn7525New_OtbPTPAr'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // localStorage is fine on both web and the Capacitor WebView.
    storageKey: 'dd_owner_supabase_auth',
  },
})