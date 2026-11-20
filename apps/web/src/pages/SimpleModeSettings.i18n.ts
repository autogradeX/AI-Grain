import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Simple mode (station screen)", hi: "सरल मोड (स्टेशन स्क्रीन)" },
  hint: {
    en: "A one-tap screen for operators who aren't technical: they pick the grain and tap once; the station weighs, reads moisture, photographs, checks and prints by itself. Set it up once here.",
    hi: "गैर-तकनीकी ऑपरेटरों के लिए एक-टैप स्क्रीन: वे अनाज चुनते हैं और एक बार छूते हैं; स्टेशन अपने-आप तौलता, नमी पढ़ता, फ़ोटो लेता, जाँचता और छापता है। इसे यहाँ एक बार सेट करें।",
  },
  crops: { en: "Crops offered", hi: "दिखाई जाने वाली फ़सलें" },
  standard: { en: "Standard", hi: "मानक" },
  none: { en: "None", hi: "कोई नहीं" },
  capture: { en: "Cameras", hi: "कैमरे" },
  captureTwo: {
    en: "Two USB cameras (top and bottom of a glass tray)",
    hi: "दो USB कैमरे (कांच की ट्रे के ऊपर और नीचे)",
  },
  captureOne: { en: "One camera", hi: "एक कैमरा" },
  weigh: {
    en: "Read the sample mass from the balance",
    hi: "तराज़ू से नमूने का वज़न पढ़ें",
  },
  moisture: { en: "Read moisture from the meter", hi: "मीटर से नमी पढ़ें" },
  autoPrint: { en: "Print the slip by itself", hi: "पर्ची अपने-आप छापें" },
  askFarmer: {
    en: "Ask for the farmer's details before each test",
    hi: "हर जाँच से पहले किसान का विवरण पूछें",
  },
  language: { en: "Screen language", hi: "स्क्रीन की भाषा" },
  locked: {
    en: "Operators only see this screen (admins still see everything)",
    hi: "ऑपरेटर केवल यही स्क्रीन देखें (व्यवस्थापक सब कुछ देखते हैं)",
  },
  save: { en: "Save", hi: "सहेजें" },
  saved: { en: "Saved", hi: "सहेजा गया" },
  open: { en: "Open Simple mode", hi: "सरल मोड खोलें" },
  kiosk: {
    en: "On the station computer, run deploy/station/kiosk.sh once: it starts full-screen on this screen at power-on and prints slips without a dialog.",
    hi: "स्टेशन कंप्यूटर पर deploy/station/kiosk.sh एक बार चलाएँ: यह चालू होते ही इसी स्क्रीन पर पूरी स्क्रीन में खुलता है और बिना संवाद के पर्ची छापता है।",
  },
  helpTitle: {
    en: "Help reports from the station",
    hi: "स्टेशन से मदद रिपोर्ट",
  },
  helpNone: { en: "None yet.", hi: "अभी कोई नहीं।" },
  helpBy: { en: "{name} · {date}", hi: "{name} · {date}" },
  station: { en: "Station: {name}", hi: "स्टेशन: {name}" },
});
