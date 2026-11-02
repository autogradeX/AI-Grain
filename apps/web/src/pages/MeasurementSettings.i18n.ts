import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: {
    en: "Kernel size without the board",
    hi: "बोर्ड के बिना दाने का आकार",
  },
  intro: {
    en: "Photos on the grid board are measured from its 1 cm grid. Without the board, put a coin beside the kernels: its known diameter gives the scale, and it isn't counted as a kernel.",
    hi: "ग्रिड बोर्ड पर ली गई फ़ोटो उसकी 1 सेमी ग्रिड से मापी जाती हैं। बोर्ड के बिना, दानों के पास एक सिक्का रखें: उसका ज्ञात व्यास पैमाना देता है, और उसे दाना नहीं गिना जाता।",
  },
  coin: { en: "Reference coin", hi: "संदर्भ सिक्का" },
  none: {
    en: "None (no sizes without the board)",
    hi: "कोई नहीं (बोर्ड के बिना आकार नहीं)",
  },
  custom: { en: "Other: enter its diameter", hi: "अन्य: उसका व्यास लिखें" },
  diameter: { en: "Diameter (mm)", hi: "व्यास (मिमी)" },
  hint: {
    en: "Coins of older series differ in size: measure yours once with a ruler. Use one that stands out from the background (a brass ₹10 on white paper), flat and not touching kernels.",
    hi: "पुरानी श्रृंखला के सिक्कों का आकार अलग होता है: अपना सिक्का एक बार रूलर से माप लें। ऐसा सिक्का लें जो पृष्ठभूमि से अलग दिखे (सफ़ेद काग़ज़ पर पीतल का ₹10), सपाट और दानों से दूर।",
  },
  save: { en: "Save", hi: "सहेजें" },
  saved: {
    en: "Saved. New photos use it.",
    hi: "सहेजा गया। नई फ़ोटो में इसका उपयोग होगा।",
  },
});
