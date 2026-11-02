import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Integrations", hi: "एकीकरण" },
  intro: {
    en: "Connect APMC, eNAM bridge and ERP systems. They receive each completed result (every quality parameter, grade, kernel size and the certificate code) by webhook, or read results with an API key.",
    hi: "APMC, eNAM ब्रिज और ERP सिस्टम जोड़ें। उन्हें हर पूरा परिणाम (हर गुणवत्ता मानक, ग्रेड, दाने का आकार और प्रमाणपत्र कोड) वेबहुक से मिलता है, या वे API कुंजी से परिणाम पढ़ते हैं।",
  },
  webhook: { en: "Webhook", hi: "वेबहुक" },
  webhookHint: {
    en: "Each completed sample is sent here as JSON (event sample.completed), signed with the secret in the X-AIGrain-Signature header (HMAC-SHA256).",
    hi: "हर पूरा नमूना यहाँ JSON (इवेंट sample.completed) के रूप में भेजा जाता है, X-AIGrain-Signature हेडर में सीक्रेट से हस्ताक्षरित (HMAC-SHA256)।",
  },
  url: { en: "Receiver URL (https)", hi: "प्राप्तकर्ता URL (https)" },
  secret: { en: "Signing secret", hi: "हस्ताक्षर सीक्रेट" },
  saveWebhook: { en: "Save webhook", hi: "वेबहुक सहेजें" },
  removeWebhook: { en: "Remove", hi: "हटाएँ" },
  rotate: { en: "New secret", hi: "नया सीक्रेट" },
  test: { en: "Send a test", hi: "टेस्ट भेजें" },
  testOk: {
    en: "Delivered (HTTP {status}).",
    hi: "पहुँच गया (HTTP {status})।",
  },
  testFailed: {
    en: "Not delivered: {reason}",
    hi: "नहीं पहुँचा: {reason}",
  },
  keys: { en: "API keys", hi: "API कुंजियाँ" },
  keysHint: {
    en: "For systems that read results: GET /api/v1/results?since=… with the header Authorization: Bearer <key>.",
    hi: "परिणाम पढ़ने वाले सिस्टम के लिए: GET /api/v1/results?since=… हेडर Authorization: Bearer <key> के साथ।",
  },
  keyName: { en: "Name (e.g. eNAM bridge)", hi: "नाम (जैसे eNAM ब्रिज)" },
  createKey: { en: "Create key", hi: "कुंजी बनाएँ" },
  newKey: {
    en: "Copy this key now: it won't be shown again.",
    hi: "यह कुंजी अभी कॉपी करें: यह दोबारा नहीं दिखेगी।",
  },
  noKeys: { en: "No keys yet.", hi: "अभी कोई कुंजी नहीं।" },
  lastUsed: { en: "last used {date}", hi: "आख़िरी उपयोग {date}" },
  neverUsed: { en: "never used", hi: "कभी उपयोग नहीं" },
  revoke: { en: "Revoke", hi: "रद्द करें" },
  confirmRevoke: {
    en: "Revoke {name}? Systems using it lose access at once.",
    hi: "{name} रद्द करें? इसका उपयोग करने वाले सिस्टम की पहुँच तुरंत बंद होगी।",
  },
  central: { en: "Central server", hi: "केंद्रीय सर्वर" },
  centralHint: {
    en: "For a station at a mandi: each completed result and its certificate are sent to the central AI-Grain server whenever there is internet, and report QR codes open the central site, so anyone can verify them. Create a station key on the central server (Integrations → API keys) and enter it here.",
    hi: "मंडी के स्टेशन के लिए: इंटरनेट मिलते ही हर पूरा परिणाम और उसका प्रमाणपत्र केंद्रीय AI-Grain सर्वर को भेजा जाता है, और रिपोर्ट के QR कोड केंद्रीय साइट खोलते हैं, ताकि कोई भी उन्हें जाँच सके। केंद्रीय सर्वर पर स्टेशन कुंजी बनाएँ (एकीकरण → API कुंजियाँ) और यहाँ डालें।",
  },
  centralUrl: {
    en: "Central server address (https)",
    hi: "केंद्रीय सर्वर का पता (https)",
  },
  centralKey: { en: "Station key", hi: "स्टेशन कुंजी" },
  centralKeyHint: {
    en: "Starts with agk_, from the central server.",
    hi: "agk_ से शुरू होती है, केंद्रीय सर्वर से।",
  },
  centralKeySet: {
    en: "A key is saved. Enter a new one only to replace it.",
    hi: "कुंजी सहेजी गई है। बदलने के लिए ही नई डालें।",
  },
  saveCentral: { en: "Save", hi: "सहेजें" },
  centralOk: {
    en: "The central server accepted this station's key.",
    hi: "केंद्रीय सर्वर ने इस स्टेशन की कुंजी स्वीकार की।",
  },
  outbox: { en: "Sending results", hi: "परिणाम भेजना" },
  waiting_one: {
    en: "{count} result waiting to be sent (it goes out by itself when there is internet).",
    hi: "{count} परिणाम भेजा जाना बाकी (इंटरनेट मिलते ही अपने आप जाएगा)।",
  },
  waiting_other: {
    en: "{count} results waiting to be sent (they go out by themselves when there is internet).",
    hi: "{count} परिणाम भेजे जाने बाकी (इंटरनेट मिलते ही अपने आप जाएँगे)।",
  },
  allSent: { en: "Everything has been sent.", hi: "सब भेजा जा चुका है।" },
  lastSent: {
    en: "Last sent {date} · {count} in the last 24 hours.",
    hi: "आख़िरी बार {date} · पिछले 24 घंटों में {count}।",
  },
  neverSent: { en: "Nothing sent yet.", hi: "अभी कुछ नहीं भेजा।" },
  sendNow: { en: "Send now", hi: "अभी भेजें" },
  what: { en: "What", hi: "क्या" },
  to: { en: "To", hi: "किसे" },
  state: { en: "State", hi: "स्थिति" },
  sentAt: { en: "Sent {date}", hi: "भेजा {date}" },
  queued: { en: "Waiting", hi: "बाकी" },
  retry: {
    en: "next try {date} ({error})",
    hi: "अगली कोशिश {date} ({error})",
  },
  scope: { en: "What the key may do", hi: "कुंजी क्या कर सकती है" },
  scopeRead: { en: "Read results", hi: "परिणाम पढ़ना" },
  scopeStation: {
    en: "Station: send results here",
    hi: "स्टेशन: यहाँ परिणाम भेजना",
  },
  format: { en: "Result format", hi: "परिणाम का प्रारूप" },
  formatHint: {
    en: "Format {schema}. Download any completed sample's result from its page (Result file) to see an example.",
    hi: "प्रारूप {schema}। उदाहरण के लिए किसी पूरे नमूने के पेज से उसका परिणाम (परिणाम फ़ाइल) डाउनलोड करें।",
  },
});
