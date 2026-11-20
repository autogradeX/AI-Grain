import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Prices", hi: "भाव" },
  hint: {
    en: "What the buyer pays under this standard: a price per grade (or one base price) and deductions for each point beyond a free allowance. Shown on the result, the slip and the farmer's message. Your own rates; nothing is preset.",
    hi: "इस मानक पर खरीदार क्या देता है: हर ग्रेड का भाव (या एक मूल भाव) और छूट से ऊपर हर अंक पर कटौती। परिणाम, पर्ची और किसान के संदेश में दिखता है। आपकी अपनी दरें; कुछ पहले से तय नहीं।",
  },
  enable: {
    en: "Set prices for this standard",
    hi: "इस मानक के लिए भाव तय करें",
  },
  currency: { en: "Currency", hi: "मुद्रा" },
  unit: { en: "Per", hi: "प्रति" },
  quintal: { en: "quintal", hi: "क्विंटल" },
  tonne: { en: "tonne", hi: "टन" },
  kg: { en: "kg", hi: "किलो" },
  basePrice: { en: "Base price", hi: "मूल भाव" },
  gradePrice: { en: "Price for grade {grade}", hi: "ग्रेड {grade} का भाव" },
  gradePriceHint: { en: "Empty: base price", hi: "खाली: मूल भाव" },
  rejectUngraded: {
    en: "No price for lots that meet no grade",
    hi: "जो लॉट किसी ग्रेड में नहीं आते उनका कोई भाव नहीं",
  },
  deductions: { en: "Deductions", hi: "कटौतियाँ" },
  what: { en: "On", hi: "किस पर" },
  allowance: { en: "Free up to / at least (%)", hi: "छूट तक / कम से कम (%)" },
  rate: { en: "Per point beyond", hi: "हर अतिरिक्त अंक पर" },
  amount: { en: "amount off", hi: "राशि कम" },
  percent: { en: "% of price off", hi: "भाव का % कम" },
  moisture: { en: "Moisture", hi: "नमी" },
  totalDefects: { en: "Total defects", hi: "कुल दोष" },
  protein: { en: "Protein (below)", hi: "प्रोटीन (कम होने पर)" },
  oil: { en: "Oil (below)", hi: "तेल (कम होने पर)" },
  add: { en: "Add deduction", hi: "कटौती जोड़ें" },
  remove: { en: "Remove", hi: "हटाएँ" },
  example: {
    en: "Example: moisture free up to 12 %, 1 % of the price off per point above.",
    hi: "उदाहरण: नमी 12 % तक छूट, ऊपर हर अंक पर भाव का 1 % कम।",
  },
});
