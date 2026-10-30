import { defineMessages } from "../i18n";

export const m = defineMessages({
  // Page
  backToSamples: { en: "← Samples", hi: "← नमूने" },
  heading: { en: "Sample #{number} · {crop}", hi: "नमूना #{number} · {crop}" },
  noSource: { en: "No source", hi: "स्रोत नहीं" },
  createdOn: { en: "created {date}", hi: "बनाया गया {date}" },
  completed: { en: "Completed", hi: "पूरा हुआ" },
  inProgress: { en: "In progress", hi: "जारी है" },

  // Details
  details: { en: "Details", hi: "विवरण" },
  standard: { en: "Standard", hi: "मानक" },
  noStandard: {
    en: "None (no grade will be assigned)",
    hi: "कोई नहीं (ग्रेड नहीं दिया जाएगा)",
  },
  aiModel: { en: "AI model", hi: "AI मॉडल" },
  notes: { en: "Notes", hi: "टिप्पणी" },
  aiModelForSample: {
    en: "AI model for this sample",
    hi: "इस नमूने के लिए AI मॉडल",
  },
  orgDefault: { en: "Organisation default", hi: "संगठन का डिफ़ॉल्ट" },
  source: { en: "Source", hi: "स्रोत" },

  // 1. Weigh
  weighTitle: {
    en: "1. Weigh the working sample",
    hi: "1. जाँच वाले नमूने को तौलें",
  },
  weighHint: {
    en: "Use a 0.01 g scale. A kitchen scale with 1 g steps is too coarse: on a 50 g sample, 1 g is already 2 %.",
    hi: "0.01 g वाला तराज़ू इस्तेमाल करें। 1 g वाला रसोई का तराज़ू बहुत मोटा है: 50 g के नमूने पर 1 g ही 2 % हो जाता है।",
  },
  sampleMass: { en: "Sample mass (g)", hi: "नमूने का वज़न (g)" },
  moisture: { en: "Moisture (%)", hi: "नमी (%)" },
  moistureHint: {
    en: "Optional, from a moisture meter",
    hi: "वैकल्पिक, नमी मीटर से",
  },
  testWeight: { en: "Test weight (kg/hl)", hi: "टेस्ट वेट (kg/hl)" },
  optional: { en: "Optional", hi: "वैकल्पिक" },

  // 2. Photos
  photosTitle: { en: "2. Photograph the kernels", hi: "2. दानों की फ़ोटो लें" },
  addPhoto: { en: "Add photo", hi: "फ़ोटो जोड़ें" },
  photosHint: {
    en: "Spread 100–150 kernels on the grid board in one layer, not touching. Photograph straight down with every grid cell visible. Repeat until the whole sample is done. Optionally flip the kernels and add a crease-side photo.",
    hi: "ग्रिड बोर्ड पर 100–150 दाने एक परत में फैलाएँ, एक-दूसरे से सटे नहीं। ठीक ऊपर से फ़ोटो लें ताकि ग्रिड का हर खाना दिखे। पूरा नमूना होने तक दोहराएँ। चाहें तो दाने पलटकर खाँचे वाली तरफ़ की फ़ोटो भी जोड़ें।",
  },
  noPhotos: { en: "No photos yet.", hi: "अभी कोई फ़ोटो नहीं।" },
  batchTitle: { en: "Batch {number} · {side}", hi: "बैच {number} · {side}" },
  creaseSide: { en: "crease side", hi: "खाँचे वाली तरफ़" },
  topSide: { en: "top side", hi: "ऊपरी तरफ़" },
  kernelsAndDate: {
    en: "{count} kernels · {date}",
    hi: "{count} दाने · {date}",
  },
  totalKernels: {
    en: "{count} kernels detected in total.",
    hi: "कुल {count} दाने मिले।",
  },
  classifyBatches_one: {
    en: "Classify the batch with Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन से बैच का वर्गीकरण करें",
  },
  classifyBatches_other: {
    en: "Classify {count} batches with Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन से {count} बैच का वर्गीकरण करें",
  },

  // Batch status
  statusUploaded: { en: "Uploaded", hi: "अपलोड हुआ" },
  statusDetecting: { en: "Finding kernels…", hi: "दाने ढूँढे जा रहे हैं…" },
  statusDetected: { en: "Ready to classify", hi: "वर्गीकरण के लिए तैयार" },
  statusClassifying: {
    en: "Model Orchestration is classifying…",
    hi: "मॉडल ऑर्केस्ट्रेशन वर्गीकरण कर रहा है…",
  },
  statusClassified: { en: "Classified", hi: "वर्गीकृत" },
  statusFailed: { en: "Needs attention", hi: "ध्यान देना ज़रूरी" },

  // 3. Review
  reviewTitle: { en: "3. Check flagged kernels", hi: "3. चिह्नित दाने जाँचें" },
  classifyFirst: {
    en: "Classify the photos first.",
    hi: "पहले फ़ोटो का वर्गीकरण करें।",
  },
  flaggedOf: {
    en: "Model Orchestration flagged {flagged} of {total} kernels. {pending} still need your check.",
    hi: "मॉडल ऑर्केस्ट्रेशन ने {total} में से {flagged} दाने चिह्नित किए। {pending} अभी आपकी जाँच के लिए बाकी हैं।",
  },
  reviewHint: {
    en: "Pick out each flagged kernel with tweezers, check it by eye (you make the final call) and drop it into the cup for its class.",
    hi: "हर चिह्नित दाने को चिमटी से उठाएँ, आँख से जाँचें (अंतिम फ़ैसला आपका है) और उसके वर्ग वाले कप में डालें।",
  },
  reviewKernels_one: { en: "Review 1 kernels", hi: "1 दाना जाँचें" },
  reviewKernels_other: {
    en: "Review {count} kernels",
    hi: "{count} दाने जाँचें",
  },
  seeReviewed: { en: "See reviewed kernels", hi: "जाँचे गए दाने देखें" },

  // 4. Cups
  cupsTitle: { en: "4. Weigh each cup", hi: "4. हर कप को तौलें" },
  massFirst: {
    en: "Enter the sample mass in step 1 first.",
    hi: "पहले चरण 1 में नमूने का वज़न भरें।",
  },
  cupsHint: {
    en: "Mass % per class = cup weight ÷ sample weight ({mass} g) × 100. Leave classes you found nothing for empty.",
    hi: "हर वर्ग का वज़न % = कप का वज़न ÷ नमूने का वज़न ({mass} g) × 100। जिन वर्गों में कुछ नहीं मिला, उन्हें खाली छोड़ दें।",
  },
  class: { en: "Class", hi: "वर्ग" },
  kernels: { en: "Kernels", hi: "दाने" },
  cupG: { en: "Cup (g)", hi: "कप (g)" },
  massPct: { en: "Mass %", hi: "वज़न %" },
  cupAria: { en: "{class} cup (g)", hi: "{class} कप (g)" },
  totalDefects: { en: "Total defects", hi: "कुल दोष" },
  purity: { en: "Purity (sound grain)", hi: "शुद्धता (स्वस्थ दाने)" },
  saveWeights: {
    en: "Save weights and grade",
    hi: "वज़न सहेजें और ग्रेड करें",
  },

  // Limits
  limitMoisture: { en: "Moisture", hi: "नमी" },
  limitTestWeight: { en: "Test weight", hi: "टेस्ट वेट" },
  kindMax: { en: "max", hi: "अधिकतम" },
  kindMin: { en: "min", hi: "न्यूनतम" },
  notMeasured: { en: "not measured", hi: "मापा नहीं गया" },
  failure: {
    en: "{limit} {value} ({kind} {allowed})",
    hi: "{limit} {value} ({kind} {allowed})",
  },

  // Estimate
  estimateTitle: {
    en: "Instant estimate from the photos",
    hi: "फ़ोटो से तुरंत अनुमान",
  },
  pendingNote_one: {
    en: "Uses Model Orchestration's classes for the 1 flagged kernel(s) not checked yet.",
    hi: "अभी न जाँचे गए 1 चिह्नित दाने के लिए मॉडल ऑर्केस्ट्रेशन का वर्ग लिया गया है।",
  },
  pendingNote_other: {
    en: "Uses Model Orchestration's classes for the {count} flagged kernel(s) not checked yet.",
    hi: "अभी न जाँचे गए {count} चिह्नित दानों के लिए मॉडल ऑर्केस्ट्रेशन के वर्ग लिए गए हैं।",
  },
  allDecided: {
    en: "Uses your decisions for every flagged kernel.",
    hi: "हर चिह्नित दाने के लिए आपका फ़ैसला लिया गया है।",
  },
  estimatedPurity: { en: "estimated purity", hi: "अनुमानित शुद्धता" },
  grade: { en: "Grade {grade}", hi: "ग्रेड {grade}" },
  belowAllGrades: { en: "Below all grades", hi: "सभी ग्रेड से नीचे" },
  onEstimate: { en: "on the estimate", hi: "अनुमान के आधार पर" },
  group: { en: "Group", hi: "समूह" },
  estimate: { en: "Estimate", hi: "अनुमान" },
  weighed: { en: "Weighed", hi: "तौला गया" },
  largestClasses: {
    en: "Largest classes: {list}",
    hi: "सबसे बड़े वर्ग: {list}",
  },
  topClass: {
    en: "{class} {pct} ({count} objects)",
    hi: "{class} {pct} ({count} वस्तुएँ)",
  },
  estimateNote: {
    en: "Weight is estimated from each object's area in the photo and its class's mass factor, over {counted} of {objects} objects{excluded}. {pending} Weighing the cups gives the verified result.",
    hi: "वज़न का अनुमान फ़ोटो में हर वस्तु के क्षेत्रफल और उसके वर्ग के वज़न गुणक से लगाया गया है, {objects} में से {counted} वस्तुओं पर{excluded}। {pending} कप तौलने से सत्यापित परिणाम मिलता है।",
  },
  excluded: {
    en: " ({count} unclear or not yet classified are left out)",
    hi: " ({count} अस्पष्ट या अभी अवर्गीकृत वस्तुएँ शामिल नहीं हैं)",
  },

  // 5. Result
  resultTitle: { en: "5. Result and report", hi: "5. परिणाम और रिपोर्ट" },
  enterCups: {
    en: "Enter the cup weights to see the result.",
    hi: "परिणाम देखने के लिए कपों का वज़न भरें।",
  },
  enterCupsOrEstimate: {
    en: "Enter the cup weights to see the result, or complete the sample on the photo estimate (this standard allows it).",
    hi: "परिणाम देखने के लिए कपों का वज़न भरें, या फ़ोटो के अनुमान पर नमूना पूरा करें (यह मानक इसकी अनुमति देता है)।",
  },
  noStandardShort: { en: "No standard", hi: "कोई मानक नहीं" },
  purityLine: {
    en: "Purity {purity} · total defects {defects} by mass",
    hi: "शुद्धता {purity} · वज़न के हिसाब से कुल दोष {defects}",
  },
  estimatedNotWeighed: {
    en: "Estimated from photos, not weighed",
    hi: "फ़ोटो से अनुमानित, तौला नहीं गया",
  },
  whyNotMet: {
    en: "Why stricter grades were not met",
    hi: "ऊँचे ग्रेड क्यों नहीं मिले",
  },
  gradeFailures: { en: "Grade {grade}: {list}", hi: "ग्रेड {grade}: {list}" },
  writtenByClaude: {
    en: "Written by Model Orchestration from the figures above",
    hi: "ऊपर के आँकड़ों से मॉडल ऑर्केस्ट्रेशन द्वारा लिखा गया",
  },
  screeningNote: {
    en: "This is a screening and pre-check result. It is not acceptable for official trade grading unless the method has been validated and approved.",
    hi: "यह जाँच और पूर्व-परीक्षण का परिणाम है। जब तक विधि सत्यापित और स्वीकृत न हो, यह आधिकारिक व्यापारिक ग्रेडिंग के लिए मान्य नहीं है।",
  },
  pdfReport: { en: "PDF report", hi: "PDF रिपोर्ट" },
  claudeWriting: {
    en: "Model Orchestration is writing…",
    hi: "मॉडल ऑर्केस्ट्रेशन लिख रहा है…",
  },
  rewriteSummary: { en: "Rewrite summary", hi: "सारांश फिर से लिखें" },
  writeSummary: {
    en: "Write summary with Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन से सारांश लिखवाएँ",
  },
  completeSample: { en: "Complete sample", hi: "नमूना पूरा करें" },
  reopen: { en: "Reopen", hi: "फिर से खोलें" },
  completedOn: { en: "Completed {date}.", hi: "{date} को पूरा हुआ।" },

  // Certificates
  verifiedReport: { en: "Verified report", hi: "सत्यापित रिपोर्ट" },
  certificateLine: {
    en: "Code {code} (version {version}). Anyone can check it at {link}; the PDF carries the same code as a QR code.",
    hi: "कोड {code} (संस्करण {version})। कोई भी इसे {link} पर जाँच सकता है; PDF पर यही कोड QR कोड के रूप में है।",
  },
  certificateWithdrawn: {
    en: "The sample is reopened: its certificate is withdrawn until it is completed again.",
    hi: "नमूना फिर से खोला गया है: दोबारा पूरा होने तक इसका प्रमाणपत्र वापस ले लिया गया है।",
  },
  earlierVersions: { en: "Earlier versions", hi: "पुराने संस्करण" },
  issuedOn: { en: "issued {date}", hi: "जारी {date}" },
  withdrawnOn: { en: "withdrawn {date}", hi: "वापस लिया गया {date}" },
  statusValid: { en: "valid", hi: "मान्य" },

  // Public demo
  publicDemo: { en: "Public demo", hi: "सार्वजनिक डेमो" },
  onWebsite: { en: "on the website", hi: "वेबसाइट पर" },
  publicDemoHint: {
    en: "Anyone can open this sample on the website's demo page: its photos, kernels, Model Orchestration's verdicts and the result. Names, notes and the source are not shown.",
    hi: "कोई भी इस नमूने को वेबसाइट के डेमो पेज पर खोल सकता है: इसकी फ़ोटो, दाने, मॉडल ऑर्केस्ट्रेशन के फ़ैसले और परिणाम। नाम, टिप्पणी और स्रोत नहीं दिखाए जाते।",
  },
  demoTitle: { en: "Title on the demo page", hi: "डेमो पेज पर शीर्षक" },
  demoTitlePlaceholder: {
    en: "{crop} sample #{number}",
    hi: "{crop} नमूना #{number}",
  },
  saveTitle: { en: "Save title", hi: "शीर्षक सहेजें" },
  publishAsDemo: { en: "Publish as demo", hi: "डेमो के रूप में प्रकाशित करें" },
  viewDemo: { en: "View demo", hi: "डेमो देखें" },
  removeFromWebsite: { en: "Remove from website", hi: "वेबसाइट से हटाएँ" },

  // Reference (validation)
  referenceTitle: {
    en: "Certified grader result (validation)",
    hi: "प्रमाणित ग्रेडर का परिणाम (सत्यापन)",
  },
  add: { en: "Add", hi: "जोड़ें" },
  referenceHint: {
    en: "To validate this method, have a certified grader grade the same sample and enter their result here. Aim for 30–50 samples graded both ways.",
    hi: "इस विधि को सत्यापित करने के लिए, किसी प्रमाणित ग्रेडर से यही नमूना ग्रेड करवाएँ और उनका परिणाम यहाँ भरें। लक्ष्य रखें कि 30–50 नमूने दोनों तरीक़ों से ग्रेड हों।",
  },
  referenceGrade: { en: "Grade {grade}", hi: "ग्रेड {grade}" },
  referenceNone: { en: "none", hi: "कोई नहीं" },
  byGrader: { en: " by {name}", hi: " — {name} द्वारा" },
  onDate: { en: " on {date}", hi: " ({date})" },
  seeComparison: { en: "See the comparison", hi: "तुलना देखें" },
  gradeLabel: { en: "Grade", hi: "ग्रेड" },
  grader: { en: "Grader", hi: "ग्रेडर" },
  date: { en: "Date", hi: "तारीख़" },
  classPct: { en: "{class} (%)", hi: "{class} (%)" },
});
