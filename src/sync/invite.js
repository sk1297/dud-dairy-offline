// ── Customer invite (APK) ─────────────────────────────────────────────────────
// Customers install the Android app and log in with their credentials — no web
// browser is exposed. The owner shares the APK download link + login details.

// Stable "latest APK" direct-download link from GitHub Releases.
export const CUSTOMER_APK_URL =
  'https://github.com/sk1297/dud-dairy-customer/releases/latest/download/dud-dairy-customer-debug.apk'

export function buildInviteMessage({ name, code, mobile, password, dairyName }) {
  return [
    `नमस्कार${name ? ' ' + name : ''} 🙏`,
    `${dairyName || 'दूध डेअरी'} — तुमचे ग्राहक अ‍ॅप खाते तयार आहे.`,
    ``,
    `📲 अ‍ॅप डाउनलोड करा:`,
    CUSTOMER_APK_URL,
    ``,
    `🔑 लॉगिन माहिती:`,
    `डेअरी कोड: ${code}`,
    `मोबाईल: ${mobile}`,
    `पासवर्ड: ${password}`,
    ``,
    `अ‍ॅप उघडून वरील माहितीने लॉगिन करा. एकदाच लॉगिन करावे लागेल.`,
  ].join('\n')
}

// wa.me link that opens WhatsApp to the customer's number with the message.
export function buildWhatsAppLink({ name, code, mobile, password, dairyName }) {
  const text = buildInviteMessage({ name, code, mobile, password, dairyName })
  return `https://wa.me/91${String(mobile).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}
