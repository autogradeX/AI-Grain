import { defineMessages } from "../i18n";

export const m = defineMessages({
  backToSample: { en: "← Sample {number}", hi: "← नमूना {number}" },
  title: { en: "Batch · {side}", hi: "बैच · {side}" },
  sideCrease: { en: "crease side", hi: "खाँचे वाली तरफ़" },
  sideTop: { en: "top side", hi: "ऊपरी तरफ़" },
  counts: {
    en: "{kernels} kernels · {flagged} flagged · {pending} to check",
    hi: "{kernels} दाने · {flagged} चिह्नित · {pending} जाँचने बाकी",
  },
  findingKernels: { en: "Finding kernels…", hi: "दाने खोजे जा रहे हैं…" },
  classifying: {
    en: "Model Orchestration is classifying the kernels…",
    hi: "मॉडल ऑर्केस्ट्रेशन दानों का वर्गीकरण कर रहा है…",
  },
  straightenedBoard: { en: "Straightened board", hi: "सीधा किया गया बोर्ड" },
  tapKernel: {
    en: "Tap a kernel on the photo to see Model Orchestration's verdict and set its class.",
    hi: "मॉडल ऑर्केस्ट्रेशन का फ़ैसला देखने और वर्ग तय करने के लिए फ़ोटो में किसी दाने पर टैप करें।",
  },
  classifyRemaining: {
    en: "Classify remaining kernels",
    hi: "बाकी दानों का वर्गीकरण करें",
  },
  classifyWithClaude: {
    en: "Classify with Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन से वर्गीकरण करें",
  },
  reviewFlagged: {
    en: "Review flagged kernels",
    hi: "चिह्नित दानों की जाँच करें",
  },
  confirmReclassify: {
    en: "Ask Model Orchestration again for every kernel? Your decisions are kept.",
    hi: "हर दाने के लिए मॉडल ऑर्केस्ट्रेशन से फिर पूछें? आपके फ़ैसले बने रहेंगे।",
  },
  reclassifyAll: { en: "Reclassify all", hi: "सभी का फिर से वर्गीकरण" },
  remarkCorners: { en: "Re-mark corners", hi: "कोने फिर से चिह्नित करें" },
  confirmDelete: {
    en: "Delete this photo and its kernels?",
    hi: "यह फ़ोटो और इसके दाने हटाएँ?",
  },
  deleteBatch: { en: "Delete batch", hi: "बैच हटाएँ" },
  remarkRetry: {
    en: "Re-mark corners and retry",
    hi: "कोने फिर से चिह्नित करके दोबारा कोशिश करें",
  },
  legendDefect: { en: "Defect", hi: "दोष" },
  legendUnclear: { en: "Unclear", hi: "अस्पष्ट" },
  legendCluster: { en: "Touching kernels", hi: "सटे हुए दाने" },
  legendSound: { en: "Sound", hi: "स्वस्थ" },
  legendPending: { en: "Not classified", hi: "वर्गीकृत नहीं" },
  kernelTitle: {
    en: "Kernel #{number} · cell {cell}",
    hi: "दाना #{number} · खाना {cell}",
  },
  kernelAlt: { en: "Kernel {number}", hi: "दाना {number}" },
  clusterWarning: {
    en: "Looks like touching kernels. Separate them and take a new photo, or classify the group by hand.",
    hi: "ये सटे हुए दाने लगते हैं। इन्हें अलग करके नई फ़ोटो लें, या समूह का वर्ग खुद तय करें।",
  },
  claude: { en: "Model Orchestration:", hi: "मॉडल ऑर्केस्ट्रेशन:" },
  confidence: { en: "{level} confidence", hi: "भरोसा: {level}" },
  confidence_high: { en: "high", hi: "ज़्यादा" },
  confidence_medium: { en: "medium", hi: "मध्यम" },
  confidence_low: { en: "low", hi: "कम" },
  yourDecision: { en: "Your decision:", hi: "आपका फ़ैसला:" },
  notChecked: { en: "not checked", hi: "जाँचा नहीं गया" },
  clearDecision: { en: "Clear my decision", hi: "मेरा फ़ैसला हटाएँ" },
  putInCup: {
    en: "Put this kernel in the “{cls}” cup.",
    hi: "इस दाने को “{cls}” वाले कप में रखें।",
  },
  remarkTitle: {
    en: "Re-mark the grid corners",
    hi: "ग्रिड के कोने फिर से चिह्नित करें",
  },
  remarkHint: {
    en: "Kernels will be found again; earlier verdicts and decisions for this photo are cleared.",
    hi: "दाने फिर से खोजे जाएँगे; इस फ़ोटो के पिछले फ़ैसले और निर्णय हट जाएँगे।",
  },
  findAgain: { en: "Find kernels again", hi: "दाने फिर से खोजें" },
});
