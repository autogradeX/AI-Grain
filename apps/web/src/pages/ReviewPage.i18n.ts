import { defineMessages } from "../i18n";

export const m = defineMessages({
  backToSample: { en: "← Sample {number}", hi: "← नमूना {number}" },
  title: { en: "Check flagged kernels", hi: "चिह्नित दाने जाँचें" },
  intro: {
    en: "For each kernel: find it on the board by its cell, pick it out with tweezers, look at it, then confirm or correct the class and drop it into that cup. Your decision is final; Model Orchestration only points.",
    hi: "हर दाने के लिए: उसके खाने (सेल) से बोर्ड पर उसे ढूँढें, चिमटी से उठाएँ, ध्यान से देखें, फिर वर्ग पक्का करें या सुधारें और उसे उसी कप में डालें। अंतिम फ़ैसला आपका है; मॉडल ऑर्केस्ट्रेशन केवल संकेत देता है।",
  },
  toCheck: { en: "To check", hi: "जाँचने बाकी" },
  allFlagged: { en: "All flagged", hi: "सभी चिह्नित" },
  allChecked: {
    en: "All flagged kernels are checked.",
    hi: "सभी चिह्नित दाने जाँच लिए गए हैं।",
  },
  noFlagged: { en: "No flagged kernels.", hi: "कोई दाना चिह्नित नहीं है।" },
  backToWeighing: { en: "Back to the sample", hi: "नमूने पर वापस जाएँ" },
  kernelAlt: { en: "Kernel {number}", hi: "दाना {number}" },
  cell: { en: "Cell {cell} · #{number}", hi: "खाना {cell} · #{number}" },
  creaseSide: { en: "Crease-side photo", hi: "खाँचे वाली तरफ़ की फ़ोटो" },
  topSide: { en: "Top-side photo", hi: "ऊपरी तरफ़ की फ़ोटो" },
  touching: { en: "Touching kernels", hi: "आपस में सटे दाने" },
  confidence_high: { en: "high", hi: "उच्च" },
  confidence_medium: { en: "medium", hi: "मध्यम" },
  confidence_low: { en: "low", hi: "कम" },
  decided: { en: "Decided: {class}", hi: "फ़ैसला: {class}" },
  confirm: { en: "Confirm {class}", hi: "{class} पक्का करें" },
  chooseClass: { en: "Choose class", hi: "वर्ग चुनें" },
  correct: { en: "Correct", hi: "सुधारें" },
  savedAsReference: {
    en: "Saved as a reference example",
    hi: "संदर्भ उदाहरण के रूप में सहेजा गया",
  },
  useAsReference: {
    en: "Use as a reference example for Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन के लिए संदर्भ उदाहरण बनाएँ",
  },
  secondOpinion: {
    en: "Second look said: {class}",
    hi: "दूसरी जाँच का कहना: {class}",
  },
});
