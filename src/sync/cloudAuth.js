// ── Owner cloud authentication ────────────────────────────────────────────────
// The dairy owner signs into Supabase once. This identity is what RLS uses to
// authorise writing the dairy's data during sync. Separate from the app's local
// (offline) login — this is only for cloud sync.
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabaseClient.js'

const PROVISION_FN = `${SUPABASE_URL}/functions/v1/provision`

async function callProvision(body, jwt) {
  const res = await fetch(PROVISION_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json.error || `त्रुटी (${res.status})`)
  return json
}

export async function cloudSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data.user
}

// First-time owner: create the cloud account via the admin edge function (no
// confirmation email), then sign in. `setupCode` is the shared provisioning code.
export async function cloudSignUp(email, password, setupCode) {
  await callProvision({ action: 'owner', email, password, setup_code: setupCode })
  return cloudSignIn(email, password)
}

export async function cloudSignOut() {
  await supabase.auth.signOut()
}

export async function getCloudUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Owner creates / updates a customer's login (mobile + password). The customer
// must already exist in the cloud (run a sync first). Requires the owner to be
// signed in.
export async function provisionCustomerLogin({ dairyId, localId, mobile, password }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('प्रथम क्लाउडमध्ये साइन इन करा')
  return callProvision(
    { action: 'customer', dairy_id: dairyId, local_id: localId, mobile, password },
    session.access_token,
  )
}
