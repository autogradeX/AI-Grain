import { defineMessages } from "../i18n";

export const m = defineMessages({
  draftTitle: {
    en: "Draft with Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन से मसौदा बनाएँ",
  },
  draftHint: {
    en: "Name the official standard you grade against (agency, commodity, grade, season). Model Orchestration drafts its grades, limits and definitions for this crop's classes. It can be wrong or out of date: check every limit against the official document before saving.",
    hi: "जिस आधिकारिक मानक से आप ग्रेडिंग करते हैं उसका नाम लिखें (एजेंसी, फ़सल, ग्रेड, सीज़न)। मॉडल ऑर्केस्ट्रेशन इस फ़सल के वर्गों के लिए उसके ग्रेड, सीमाएँ और परिभाषाएँ का मसौदा बनाता है। यह ग़लत या पुराना हो सकता है: सहेजने से पहले हर सीमा आधिकारिक दस्तावेज़ से मिलाएँ।",
  },
  draftPlaceholder: {
    en: "e.g. FCI Uniform Specifications, rice (raw), 2025-26",
    hi: "जैसे FCI समान विनिर्देश, चावल (कच्चा), 2025-26",
  },
  draft: { en: "Draft the limits", hi: "सीमाओं का मसौदा बनाएँ" },
  drafting: { en: "Drafting…", hi: "मसौदा बन रहा है…" },
  draftFilled: {
    en: "The form below is filled with the draft.",
    hi: "नीचे का फ़ॉर्म मसौदे से भर दिया गया है।",
  },
  draftCheck: {
    en: "Based on: {basis}. Check every limit against the official document, then save.",
    hi: "आधार: {basis}। हर सीमा आधिकारिक दस्तावेज़ से मिलाएँ, फिर सहेजें।",
  },
  draftEmpty: {
    en: "No draft: Model Orchestration doesn't know this standard well enough.",
    hi: "कोई मसौदा नहीं: मॉडल ऑर्केस्ट्रेशन इस मानक को पर्याप्त नहीं जानता।",
  },
  draftUncertain: {
    en: "Not sure about (check these first):",
    hi: "इन पर निश्चित नहीं (पहले इन्हें जाँचें):",
  },
  draftUnmatched: {
    en: "The standard limits these, but this crop has no class for them. Add the classes to the crop to set their limits:",
    hi: "मानक इनकी सीमा तय करता है, पर इस फ़सल में इनका कोई वर्ग नहीं है। इनकी सीमा रखने के लिए फ़सल में वर्ग जोड़ें:",
  },
  title: { en: "Grading standards", hi: "ग्रेडिंग मानक" },
  newStandard: { en: "New standard", hi: "नया मानक" },
  intro: {
    en: "A standard holds the grade limits (maximum mass % per defect class) and the defect definitions Model Orchestration is given. Copy the limits from the official standard you grade against; the app ships with none built in.",
    hi: "मानक में ग्रेड की सीमाएँ (हर दोष-वर्ग का अधिकतम भार %) और मॉडल ऑर्केस्ट्रेशन को दी जाने वाली दोषों की परिभाषाएँ होती हैं। सीमाएँ उस आधिकारिक मानक से लें जिसके अनुसार आप ग्रेडिंग करते हैं; ऐप में कोई मानक पहले से नहीं है।",
  },
  showArchived: { en: "Show archived", hi: "संग्रहित भी दिखाएँ" },
  noStandards: { en: "No standards yet.", hi: "अभी कोई मानक नहीं है।" },
  createOne: {
    en: "Create one to grade samples.",
    hi: "नमूनों की ग्रेडिंग के लिए एक मानक बनाएँ।",
  },
  askAdmin: {
    en: "Ask an admin to create one.",
    hi: "किसी व्यवस्थापक से मानक बनाने को कहें।",
  },
  gradesUpdated: {
    en: "Grades {grades} · updated {date}",
    hi: "ग्रेड {grades} · अपडेट {date}",
  },
  archived: { en: "Archived", hi: "संग्रहित" },
  backToStandards: { en: "← Standards", hi: "← मानक" },
  standard: { en: "Standard", hi: "मानक" },
  name: { en: "Name", hi: "नाम" },
  nameHint: {
    en: "For example the standard's official name and year",
    hi: "जैसे मानक का आधिकारिक नाम और वर्ष",
  },
  crop: { en: "Crop", hi: "फ़सल" },
  editCrops: {
    en: "Edit crops and their classes",
    hi: "फ़सलें और उनके वर्ग बदलें",
  },
  description: { en: "Description", hi: "विवरण" },
  allowEstimate: {
    en: "Allow completing a sample on the photo estimate when it wasn't weighed (faster, but not verified by the scale)",
    hi: "बिना तौले, फ़ोटो अनुमान पर ही नमूना पूरा करने दें (तेज़, पर तराज़ू से सत्यापित नहीं)",
  },
  gradeLimits: { en: "Grade limits", hi: "ग्रेड सीमाएँ" },
  addGrade: { en: "Add grade", hi: "ग्रेड जोड़ें" },
  limitsHint: {
    en: "Strictest grade first. A sample gets the first grade whose limits it meets. Limits apply per class and per group. Leave a box empty for no limit. A moisture or test-weight limit fails when that value wasn't measured.",
    hi: "सबसे सख़्त ग्रेड पहले रखें। नमूने को वह पहला ग्रेड मिलता है जिसकी सभी सीमाएँ वह पूरी करता है। सीमाएँ हर वर्ग और हर समूह पर लागू होती हैं। कोई सीमा न हो तो खाना खाली छोड़ें। नमी या टेस्ट वेट की सीमा तब विफल होती है जब वह मान मापा न गया हो।",
  },
  limit: { en: "Limit", hi: "सीमा" },
  gradeName: { en: "Grade name", hi: "ग्रेड का नाम" },
  removeGrade: { en: "remove", hi: "हटाएँ" },
  maxPct: { en: "{label} max %", hi: "{label} अधिकतम %" },
  limitAria: { en: "{label} grade {grade}", hi: "{label} ग्रेड {grade}" },
  totalDefects: { en: "Total defects max %", hi: "कुल दोष अधिकतम %" },
  totalAria: { en: "Total grade {grade}", hi: "कुल ग्रेड {grade}" },
  moisture: { en: "Moisture max %", hi: "नमी अधिकतम %" },
  moistureAria: { en: "Moisture grade {grade}", hi: "नमी ग्रेड {grade}" },
  testWeight: {
    en: "Test weight min kg/hl",
    hi: "टेस्ट वेट न्यूनतम kg/hl",
  },
  testWeightAria: {
    en: "Test weight grade {grade}",
    hi: "टेस्ट वेट ग्रेड {grade}",
  },
  definitionsTitle: {
    en: "Defect definitions for Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन के लिए दोषों की परिभाषाएँ",
  },
  definitionsHint: {
    en: "Model Orchestration reads these with every request. Leave a box empty to use the crop's own description (shown greyed). Paste the standard's wording where it differs, plus any local guidance (for example how to tell Fusarium from weather bleaching in your region).",
    hi: "मॉडल ऑर्केस्ट्रेशन हर अनुरोध के साथ इन्हें पढ़ता है। फ़सल का अपना विवरण (हल्के रंग में दिखा) इस्तेमाल करने के लिए खाना खाली छोड़ें। जहाँ मानक की भाषा अलग हो, वहाँ उसे चिपकाएँ, साथ में कोई स्थानीय निर्देश भी (जैसे आपके इलाके में फ्यूज़ेरियम और मौसम से पड़ी सफ़ेदी में फ़र्क कैसे करें)। अंग्रेज़ी में लिखना सबसे अच्छा है।",
  },
  restore: { en: "Restore", hi: "वापस लाएँ" },
  archive: { en: "Archive", hi: "संग्रहित करें" },
  saveStandard: { en: "Save standard", hi: "मानक सहेजें" },
});
