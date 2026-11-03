import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: {
    en: "Possible fake grains",
    hi: "संभावित नकली दाने",
  },
  suspected_one: {
    en: "Model Orchestration suspects {count} kernel is artificial (plastic, moulded, dyed or coated). A person must check it.",
    hi: "Model Orchestration को {count} दाना कृत्रिम (प्लास्टिक, ढला हुआ, रंगा या लेपित) लगता है। किसी व्यक्ति को इसे जाँचना होगा।",
  },
  suspected_other: {
    en: "Model Orchestration suspects {count} kernels are artificial (plastic, moulded, dyed or coated). A person must check them.",
    hi: "Model Orchestration को {count} दाने कृत्रिम (प्लास्टिक, ढले हुए, रंगे या लेपित) लगते हैं। किसी व्यक्ति को इन्हें जाँचना होगा।",
  },
  confirmed_one: {
    en: "{count} kernel was confirmed as artificial on review.",
    hi: "जाँच में {count} दाना कृत्रिम पाया गया।",
  },
  confirmed_other: {
    en: "{count} kernels were confirmed as artificial on review.",
    hi: "जाँच में {count} दाने कृत्रिम पाए गए।",
  },
  test: {
    en: "A photo can only raise the suspicion. Confirm with a physical test before trading: put a few in water (plastic floats), heat one with a flame (plastic melts and smells of burning plastic, grain chars), or rub with a wet cloth (dye comes off).",
    hi: "फ़ोटो से केवल संदेह होता है। व्यापार से पहले भौतिक जाँच से पुष्टि करें: कुछ दाने पानी में डालें (प्लास्टिक तैरता है), एक दाने को लौ पर गरम करें (प्लास्टिक पिघलता है और जले प्लास्टिक की गंध आती है, अनाज जलकर काला होता है), या गीले कपड़े से रगड़ें (रंग छूटता है)।",
  },
  review: { en: "Check them", hi: "इन्हें जाँचें" },
});
