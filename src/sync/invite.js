// ── Customer invite links ─────────────────────────────────────────────────────
// Builds a magic link to the hosted customer web app that pre-fills the dairy
// code + mobile + password so the customer is auto-logged-in with one tap.
export const CUSTOMER_WEB_URL = 'https://sk1297.github.io/dud-dairy-customer'

// base64 that safely handles Unicode passwords
const b64 = (s) => btoa(unescape(encodeURIComponent(String(s))))

export function buildInviteLink({ code, mobile, password }) {
  const p = password ? `&p=${b64(password)}` : ''
  return `${CUSTOMER_WEB_URL}/#/login?c=${encodeURIComponent(code)}&m=${encodeURIComponent(mobile)}${p}`
}

export function buildInviteMessage({ name, code, mobile, password, dairyName }) {
  const link = buildInviteLink({ code, mobile, password })
  return [
    `नमस्कार${name ? ' ' + name : ''} 🙏`,
    `${dairyName || 'दूध डेअरी'} — तुमचे ग्राहक खाते तयार आहे.`,
    ``,
    `👉 इथे टॅप करून तुमचे दूध, बिल व पेमेंट पहा:`,
    link,
    ``,
    `(डेअरी कोड: ${code} · मोबाईल: ${mobile})`,
  ].join('\n')
}

// wa.me link that opens WhatsApp to the customer's number with the message.
export function buildWhatsAppLink({ name, code, mobile, password, dairyName }) {
  const text = buildInviteMessage({ name, code, mobile, password, dairyName })
  return `https://wa.me/91${String(mobile).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}
