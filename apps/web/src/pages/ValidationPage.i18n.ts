import { defineMessages } from "../i18n";

export const m = defineMessages({
  downloadReport: {
    en: "Download the validation report (CSV)",
    hi: "सत्यापन रिपोर्ट डाउनलोड करें (CSV)",
  },
  within: { en: "Within ±{tol}", hi: "±{tol} के भीतर" },
  withinPlain: { en: "Within tolerance", hi: "सहनशीलता के भीतर" },
  measurements: {
    en: "Moisture, protein and oil against the lab",
    hi: "लैब की तुलना में नमी, प्रोटीन और तेल",
  },
  measurement: { en: "Measurement", hi: "माप" },
  moisture: { en: "Moisture", hi: "नमी" },
  protein: { en: "Protein", hi: "प्रोटीन" },
  oil: { en: "Oil", hi: "तेल" },
  tolerances: { en: "Tolerances", hi: "सहनशीलता" },
  tolerancesHint: {
    en: "How close, in percentage points, counts as agreeing with the reference. Use the figures your tender or standard states; empty boxes use the defaults shown.",
    hi: "संदर्भ से कितना पास (प्रतिशत अंकों में) सहमति माना जाए। अपने टेंडर या मानक में दिए अंक डालें; खाली बॉक्स दिखाए गए डिफ़ॉल्ट लेते हैं।",
  },
  tolClass: { en: "Each class", hi: "हर वर्ग" },
  title: { en: "Validation", hi: "सत्यापन" },
  intro: {
    en: "Model Orchestration runs general-purpose AI, not trained on your grain, so its accuracy is unknown until tested. Grade 30–50 samples both ways (a certified grader and this method), enter the grader's result on each sample, and compare per class here before relying on the results.",
    hi: "मॉडल ऑर्केस्ट्रेशन एक सामान्य AI है, आपके अनाज पर प्रशिक्षित नहीं, इसलिए जाँचे बिना उसकी सटीकता पता नहीं। 30–50 नमूनों को दोनों तरह से ग्रेड करें (प्रमाणित ग्रेडर से और इस विधि से), हर नमूने पर ग्रेडर का परिणाम दर्ज करें, और नतीजों पर भरोसा करने से पहले यहाँ हर वर्ग की तुलना करें।",
  },
  crop: { en: "Crop", hi: "फसल" },
  progress: { en: "Progress", hi: "प्रगति" },
  progressLabel: {
    en: "{count} of {target} samples",
    hi: "{target} में से {count} नमूने",
  },
  gradedBoth_one: {
    en: "{count} sample graded both ways.",
    hi: "{count} नमूना दोनों तरह से ग्रेड हुआ।",
  },
  gradedBoth_other: {
    en: "{count} samples graded both ways.",
    hi: "{count} नमूने दोनों तरह से ग्रेड हुए।",
  },
  moreNeeded: {
    en: "At least {count} more needed",
    hi: "कम से कम {count} और चाहिए",
  },
  enough: {
    en: "Enough for a first assessment",
    hi: "पहले आकलन के लिए पर्याप्त",
  },
  sameGrade: {
    en: "Same grade as the certified grader in {pct} of {count} samples.",
    hi: "{count} नमूनों में से {pct} में प्रमाणित ग्रेडर जैसा ही ग्रेड।",
  },
  agreement: {
    en: "Agreement per defect class (mass %)",
    hi: "हर दोष वर्ग में मेल (द्रव्यमान %)",
  },
  class: { en: "Class", hi: "वर्ग" },
  methodMean: { en: "Method mean", hi: "विधि औसत" },
  graderMean: { en: "Grader mean", hi: "ग्रेडर औसत" },
  bias: { en: "Bias", hi: "झुकाव" },
  meanAbsDiff: { en: "Mean abs. diff.", hi: "औसत अंतर" },
  maxAbsDiff: { en: "Max abs. diff.", hi: "अधिकतम अंतर" },
  biasNote: {
    en: "Bias is method minus grader: positive means this method reads high. Expect subtle defects (light heat damage, early sprouting, Fusarium versus weather bleaching) to agree least. Internal and fluorescent defects are invisible in a phone photo.",
    hi: "झुकाव = विधि घटा ग्रेडर: धनात्मक का मतलब यह विधि ज़्यादा बताती है। हल्के दोषों (थोड़ी गर्मी की क्षति, शुरुआती अंकुरण, फ्यूज़ेरियम बनाम मौसम से फीकापन) में सबसे कम मेल की उम्मीद रखें। अंदरूनी और फ्लोरोसेंट दोष फ़ोन की फ़ोटो में दिखते ही नहीं।",
  },
  samples: { en: "Samples", hi: "नमूने" },
  noStandard: { en: "no standard", hi: "कोई मानक नहीं" },
  versus: { en: "{method} vs {reference}", hi: "{method} बनाम {reference}" },
  match: { en: "match", hi: "मेल" },
  differs: { en: "differs", hi: "अलग" },
});
