import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Report layout", hi: "रिपोर्ट का प्रारूप" },
  intro: {
    en: "How PDF reports and printed slips look: your title, address lines, signature lines and which sections to include.",
    hi: "PDF रिपोर्ट और प्रिंट पर्ची कैसी दिखें: आपका शीर्षक, पते की पंक्तियाँ, हस्ताक्षर पंक्तियाँ और कौन-से भाग शामिल हों।",
  },
  reportTitle: { en: "Title", hi: "शीर्षक" },
  titlePlaceholder: {
    en: "Grain screening report",
    hi: "अनाज जाँच रिपोर्ट",
  },
  header: { en: "Lines under the title", hi: "शीर्षक के नीचे की पंक्तियाँ" },
  headerHint: {
    en: "Address, licence or lab number.",
    hi: "पता, लाइसेंस या लैब नंबर।",
  },
  footer: { en: "Footer", hi: "फ़ुटर" },
  signatures: { en: "Signature lines", hi: "हस्ताक्षर पंक्तियाँ" },
  signaturesHint: {
    en: "One per line, up to four, e.g. Assayer, Mandi Secretary.",
    hi: "हर पंक्ति में एक, अधिकतम चार, जैसे: परख अधिकारी, मंडी सचिव।",
  },
  showBoards: {
    en: "Board photos with defects circled",
    hi: "दोष घेरे हुए बोर्ड फ़ोटो",
  },
  showGallery: {
    en: "Images of every kernel not judged sound",
    hi: "हर अस्वस्थ दाने की तस्वीर",
  },
  showDimensions: {
    en: "Kernel size (length, breadth, L/B)",
    hi: "दाने का आकार (लंबाई, चौड़ाई, L/B)",
  },
  showSummary: { en: "Plain-language summary", hi: "सरल भाषा में सारांश" },
  save: { en: "Save layout", hi: "प्रारूप सहेजें" },
  saved: {
    en: "Saved. New reports use it.",
    hi: "सहेजा गया। नई रिपोर्ट इसका उपयोग करेंगी।",
  },
});
