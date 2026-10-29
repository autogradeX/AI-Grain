import { defineMessages } from "../i18n";

export const m = defineMessages({
  settings: { en: "Settings", hi: "सेटिंग्स" },
  language: { en: "Language", hi: "भाषा" },
  languageHint: {
    en: "Remembered on this device. Messages from the server stay in English.",
    hi: "इस डिवाइस पर याद रखी जाती है। सर्वर से आने वाले संदेश अंग्रेज़ी में ही रहते हैं।",
  },
  profile: { en: "Profile", hi: "प्रोफ़ाइल" },
  name: { en: "Name", hi: "नाम" },
  email: { en: "Email", hi: "ईमेल" },
  emailConfirmed: { en: "email confirmed", hi: "ईमेल की पुष्टि हो गई" },
  confirmationSent: {
    en: "Confirmation email sent",
    hi: "पुष्टि ईमेल भेज दिया गया",
  },
  resendConfirmation: {
    en: "Resend confirmation email",
    hi: "पुष्टि ईमेल फिर से भेजें",
  },
  password: { en: "Password", hi: "पासवर्ड" },
  currentPassword: { en: "Current password", hi: "मौजूदा पासवर्ड" },
  newPassword: { en: "New password", hi: "नया पासवर्ड" },
  newPasswordHint: {
    en: "At least 10 characters. Other devices will be signed out.",
    hi: "कम से कम 10 अक्षर। दूसरे डिवाइस साइन आउट हो जाएँगे।",
  },
  changePassword: { en: "Change password", hi: "पासवर्ड बदलें" },
  passwordChanged: { en: "Password changed.", hi: "पासवर्ड बदल गया।" },
  sessions: { en: "Sessions", hi: "सत्र" },
  lostPhone: {
    en: "Lost a phone? Sign out every device, including this one.",
    hi: "फ़ोन खो गया? इस डिवाइस समेत हर डिवाइस से साइन आउट करें।",
  },
  signOutEverywhere: {
    en: "Sign out everywhere",
    hi: "हर जगह से साइन आउट करें",
  },
  organisation: { en: "Organisation", hi: "संस्था" },
  claudeMissing: {
    en: "Claude is not configured on the server (ANTHROPIC_API_KEY). Classification will fail.",
    hi: "सर्वर पर Claude सेट नहीं है (ANTHROPIC_API_KEY)। वर्गीकरण नहीं हो पाएगा।",
  },
  defaultModel: { en: "Default AI model", hi: "डिफ़ॉल्ट AI मॉडल" },
  defaultModelHint: {
    en: "Sonnet is the default. Haiku costs least. Opus is for difficult samples. A sample can override this.",
    hi: "Sonnet डिफ़ॉल्ट है। Haiku सबसे सस्ता है। Opus कठिन नमूनों के लिए है। हर नमूने में इसे बदला जा सकता है।",
  },
  serverDefault: {
    en: "Server default ({model})",
    hi: "सर्वर डिफ़ॉल्ट ({model})",
  },
  saveName: { en: "Save name", hi: "नाम सहेजें" },
  activityLog: { en: "Activity log", hi: "गतिविधि लॉग" },
  when: { en: "When", hi: "कब" },
  who: { en: "Who", hi: "किसने" },
  what: { en: "What", hi: "क्या" },
  ip: { en: "IP", hi: "IP" },
});
