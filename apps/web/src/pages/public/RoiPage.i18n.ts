import { defineMessages } from "../../i18n";

export const m = defineMessages({
  modelSonnet: {
    en: "Claude Sonnet 5.5 (default)",
    hi: "Claude Sonnet 5.5 (डिफ़ॉल्ट)",
  },
  modelHaiku: {
    en: "Claude Haiku 5.5 (lowest cost)",
    hi: "Claude Haiku 5.5 (सबसे कम लागत)",
  },
  modelOpus: {
    en: "Claude Opus 5.5 (difficult samples)",
    hi: "Claude Opus 5.5 (कठिन नमूने)",
  },
  eyebrow: { en: "ROI calculator", hi: "लाभ (ROI) कैलकुलेटर" },
  title: {
    en: "What would screening with AI-Grain save?",
    hi: "AI-Grain से जाँच में कितनी बचत होगी?",
  },
  lead: {
    en: "Enter your own figures. Every number here is an assumption you can change; none is a promise.",
    hi: "अपने आँकड़े डालें। यहाँ हर संख्या एक अनुमान है जिसे आप बदल सकते हैं; कोई भी वादा नहीं है।",
  },
  yourFigures: { en: "Your figures", hi: "आपके आँकड़े" },
  samplesPerDay: { en: "Samples per day", hi: "प्रतिदिन नमूने" },
  daysPerYear: { en: "Working days per year", hi: "साल में काम के दिन" },
  manualMin: {
    en: "Minutes per sample today",
    hi: "अभी प्रति नमूना मिनट",
  },
  manualMinHint: {
    en: "Your current manual impurity analysis, including sorting and weighing.",
    hi: "आपका मौजूदा हाथ से अशुद्धि विश्लेषण, छँटाई और तौल समेत।",
  },
  aiMin: {
    en: "Minutes per sample with AI-Grain",
    hi: "AI-Grain के साथ प्रति नमूना मिनट",
  },
  aiMinHint: {
    en: "Spreading and photographing, checking flagged kernels, weighing cups. Measure it on a few samples.",
    hi: "दाने फैलाना और फ़ोटो लेना, चिह्नित दाने जाँचना, कप तौलना। कुछ नमूनों पर मापकर देखें।",
  },
  hourly: {
    en: "Labour cost per hour (USD)",
    hi: "प्रति घंटा मज़दूरी लागत (USD)",
  },
  equipment: {
    en: "Equipment, one-off (USD)",
    hi: "उपकरण, एक बार का ख़र्च (USD)",
  },
  equipmentHint: {
    en: "Scale, board, stand, light, tweezers.",
    hi: "तराज़ू, बोर्ड, स्टैंड, लाइट, चिमटी।",
  },
  model: { en: "Claude model", hi: "Claude मॉडल" },
  claudeCost: {
    en: "Claude cost per sample (USD)",
    hi: "प्रति नमूना Claude लागत (USD)",
  },
  claudeCostHint: {
    en: "A rough estimate for about 500 kernels at list prices. Signed-in users see their real cost on the Analytics page.",
    hi: "सूची मूल्यों पर लगभग 500 दानों का मोटा अनुमान। साइन-इन उपयोगकर्ता अपनी असली लागत विश्लेषण पेज पर देखते हैं।",
  },
  perYear: { en: "Per year", hi: "प्रति वर्ष" },
  samples: { en: "Samples", hi: "नमूने" },
  hoursSaved: { en: "Hours saved", hi: "बचे घंटे" },
  hours: { en: "{hours} h", hi: "{hours} घंटे" },
  labourSaved: { en: "Labour saved", hi: "मज़दूरी की बचत" },
  claudeCostTotal: { en: "Claude cost", hi: "Claude लागत" },
  netSaving: { en: "Net saving per year", hi: "प्रति वर्ष शुद्ध बचत" },
  noPayback: {
    en: "With these figures the method doesn't pay for itself; check the minutes per sample.",
    hi: "इन आँकड़ों के साथ यह तरीक़ा अपनी लागत नहीं निकालता; प्रति नमूना मिनट दोबारा जाँचें।",
  },
  payback_one: {
    en: "The equipment pays for itself in about {count} working day.",
    hi: "उपकरण की लागत लगभग {count} कार्य-दिवस में निकल आती है।",
  },
  payback_other: {
    en: "The equipment pays for itself in about {count} working days.",
    hi: "उपकरण की लागत लगभग {count} कार्य-दिवसों में निकल आती है।",
  },
  notCounted: {
    en: "Not counted: the value of documented, verifiable reports, of catching problem lots earlier, and the time for validating the method against a certified grader before relying on it.",
    hi: "इसमें शामिल नहीं: दर्ज और सत्यापित होने वाली रिपोर्टों का मूल्य, ख़राब लॉट जल्दी पकड़ने का फ़ायदा, और भरोसा करने से पहले प्रमाणित ग्रेडर से तरीक़े को सत्यापित करने में लगने वाला समय।",
  },
  talk: {
    en: "Talk about your numbers",
    hi: "अपने आँकड़ों पर बात करें",
  },
});
