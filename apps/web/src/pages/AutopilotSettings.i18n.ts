import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Autopilot", hi: "ऑटोपायलट" },
  intro: {
    en: "The AI finds the board, classifies every kernel, double-checks the defects and finishes the sample. People review only what it isn't sure about.",
    hi: "AI बोर्ड ढूँढता है, हर दाने का वर्ग तय करता है, दोषों की दोबारा जाँच करता है और नमूना पूरा करता है। लोग सिर्फ़ वही जाँचते हैं जिस पर AI निश्चित नहीं है।",
  },
  enabled: { en: "Autopilot on", hi: "ऑटोपायलट चालू" },
  enabledHint: {
    en: "Off: every defect goes to a person and each step has its own button.",
    hi: "बंद: हर दोष एक व्यक्ति के पास जाता है और हर चरण का अपना बटन होता है।",
  },
  spotCheck: { en: "Spot checks (%)", hi: "यादृच्छिक जाँच (%)" },
  spotCheckHint: {
    en: "Share of the AI's accepted verdicts a person checks anyway. Keeps measuring how accurate it is (see Analytics).",
    hi: "AI के स्वीकृत फ़ैसलों का वह हिस्सा जिसे फिर भी एक व्यक्ति जाँचता है। इससे सटीकता मापी जाती रहती है (विश्लेषण देखें)।",
  },
  summary: {
    en: "Write the plain-language summary when a sample finishes",
    hi: "नमूना पूरा होने पर सरल भाषा में सारांश लिखें",
  },
  always: {
    en: "Always sent to a person: touching kernels, uncertain or unclear verdicts, harmful classes such as ergot, and kernels where two AI passes disagree.",
    hi: "हमेशा व्यक्ति के पास: सटे हुए दाने, अनिश्चित या अस्पष्ट फ़ैसले, अरगट जैसे हानिकारक वर्ग, और वे दाने जिन पर AI की दो जाँचें असहमत हों।",
  },
  saved: { en: "Saved.", hi: "सहेजा गया।" },
});
