import { defineMessages } from "../../i18n";

export const m = defineMessages({
  // Setup
  setup1Title: { en: "Grid board", hi: "ग्रिड बोर्ड" },
  setup1Text: {
    en: "A matte dark board with a printed 1 cm grid. Its corners let the app straighten the photo and measure each kernel.",
    hi: "छपे हुए 1 cm ग्रिड वाला मैट गहरे रंग का बोर्ड। इसके कोनों से ऐप फ़ोटो सीधी करता है और हर दाना मापता है।",
  },
  setup2Title: { en: "Phone on a stand", hi: "स्टैंड पर फ़ोन" },
  setup2Text: {
    en: "Photographs the board from 20–25 cm with even light. Kernels are found by classic image processing, not AI.",
    hi: "एक समान रोशनी में 20–25 cm ऊपर से बोर्ड की फ़ोटो लेता है। दाने AI से नहीं, पारंपरिक इमेज प्रोसेसिंग से ढूँढे जाते हैं।",
  },
  setup3Title: { en: "Claude", hi: "Claude" },
  setup3Text: {
    en: "Classifies a close-up of each kernel against the crop's class definitions and reference images, with a confidence and a reason.",
    hi: "हर दाने की नज़दीकी तस्वीर को फसल के वर्गों की परिभाषाओं और संदर्भ चित्रों से मिलाकर वर्गीकृत करता है, भरोसे के स्तर और कारण के साथ।",
  },
  setup4Title: { en: "Operator and scale", hi: "ऑपरेटर और तराज़ू" },
  setup4Text: {
    en: "The operator checks every flagged kernel, sorts the defects into cups and weighs them on a 0.01 g scale.",
    hi: "ऑपरेटर हर चिह्नित दाना जाँचता है, दोषों को कपों में छाँटता है और 0.01 g वाले तराज़ू पर तौलता है।",
  },

  // FAQ
  faq1Q: {
    en: "What is AI grain impurity analysis?",
    hi: "AI अनाज अशुद्धि विश्लेषण क्या है?",
  },
  faq1A: {
    en: "Finding and classifying the objects in a grain sample that are not sound kernels: broken and damaged kernels, other cereals, weed seeds, debris and harmful material such as ergot. Here, Claude does the first pass on a photo and a person confirms it.",
    hi: "अनाज के नमूने में उन चीज़ों को ढूँढना और वर्गीकृत करना जो स्वस्थ दाने नहीं हैं: टूटे और क्षतिग्रस्त दाने, दूसरे अनाज, खरपतवार के बीज, कचरा और अरगट जैसे हानिकारक पदार्थ। यहाँ Claude फ़ोटो पर पहली जाँच करता है और एक व्यक्ति उसकी पुष्टि करता है।",
  },
  faq2Q: { en: "Is the demo a real sample?", hi: "क्या डेमो असली नमूना है?" },
  faq2A: {
    en: "Yes. It is a sample analysed in the app and published by our team, with the kernel images, Claude's verdicts and the operator's decisions as they were recorded.",
    hi: "हाँ। यह ऐप में विश्लेषित और हमारी टीम द्वारा प्रकाशित नमूना है, जिसमें दानों की तस्वीरें, Claude के फ़ैसले और ऑपरेटर के निर्णय वैसे ही हैं जैसे दर्ज हुए थे।",
  },
  faq3Q: {
    en: "Why do the result and the photo estimate differ?",
    hi: "नतीजा और फ़ोटो अनुमान अलग क्यों होते हैं?",
  },
  faq3A: {
    en: "The estimate weighs each kernel by its area in the photo. The verified result comes from weighing the sorted cups on a scale. Where both exist, the scale wins.",
    hi: "अनुमान हर दाने का वज़न फ़ोटो में उसके क्षेत्रफल से आँकता है। सत्यापित नतीजा छाँटे गए कपों को तराज़ू पर तौलने से आता है। जहाँ दोनों हों, वहाँ तराज़ू का नतीजा माना जाता है।",
  },
  faq4Q: {
    en: "Does it replace EN 15587 or manual grading?",
    hi: "क्या यह EN 15587 या हाथ से ग्रेडिंग की जगह लेता है?",
  },
  faq4A: {
    en: "No. It follows the same categories, but it is a screening and pre-check tool, not an official grading method unless validated and approved for that use.",
    hi: "नहीं। यह उन्हीं श्रेणियों पर चलता है, लेकिन यह जाँच और पूर्व-परीक्षण का साधन है; इस काम के लिए सत्यापित और स्वीकृत होने तक आधिकारिक ग्रेडिंग विधि नहीं।",
  },
  faq5Q: { en: "How reliable is it?", hi: "यह कितना भरोसेमंद है?" },
  faq5A: {
    en: "Measure it on your own grain: grade 30–50 samples both ways and compare them class by class on the Validation page. Subtle defects agree least, which is why a person checks every flagged kernel.",
    hi: "इसे अपने अनाज पर मापें: 30–50 नमूनों को दोनों तरीक़ों से ग्रेड करें और सत्यापन पेज पर हर वर्ग की तुलना करें। बारीक दोषों में सबसे कम मेल होता है, इसीलिए हर चिह्नित दाना एक व्यक्ति जाँचता है।",
  },

  // Page
  eyebrow: { en: "Interactive demo", hi: "इंटरैक्टिव डेमो" },
  title: { en: "AI grain impurity analysis", hi: "AI अनाज अशुद्धि विश्लेषण" },
  lead: {
    en: "A real sample, photographed, classified by Claude and checked by an operator. Open it and explore every kernel the system found.",
    hi: "एक असली नमूना: फ़ोटो लिया गया, Claude ने वर्गीकृत किया और ऑपरेटर ने जाँचा। इसे खोलें और सिस्टम को मिला हर दाना देखें।",
  },
  noDemo: {
    en: "No demo sample has been published yet.",
    hi: "अभी तक कोई डेमो नमूना प्रकाशित नहीं हुआ है।",
  },
  askWalkthrough: {
    en: "Ask for a live walkthrough",
    hi: "लाइव डेमो के लिए पूछें",
  },
  steps: { en: "Steps", hi: "चरण" },
  stepSelect: { en: "Select", hi: "चुनें" },
  stepCapture: { en: "Capture", hi: "फ़ोटो लें" },
  stepAnalyze: { en: "Analyze", hi: "विश्लेषण" },
  sample: { en: "Sample", hi: "नमूना" },
  sampleNumber: { en: "Sample #{number}", hi: "नमूना #{number}" },
  kernelCount_one: { en: "{count} kernel", hi: "{count} दाना" },
  kernelCount_other: { en: "{count} kernels", hi: "{count} दाने" },
  captureImage: { en: "Capture image", hi: "फ़ोटो लें" },
  analyze: { en: "Analyze", hi: "विश्लेषण करें" },
  loadingSample: { en: "Loading sample…", hi: "नमूना लोड हो रहा है…" },
  stationReady: {
    en: "Imaging station ready",
    hi: "इमेजिंग स्टेशन तैयार",
  },
  sampleLoaded: {
    en: "{crop} sample loaded on the board. Press {button}.",
    hi: "{crop} का नमूना बोर्ड पर रखा है। {button} दबाएँ।",
  },
  boardAlt: {
    en: "{crop} sample on the grid board",
    hi: "ग्रिड बोर्ड पर {crop} का नमूना",
  },
  kernelAria: { en: "Kernel {number}, {cls}", hi: "दाना {number}, {cls}" },
  photo: { en: "Photo {number}", hi: "फ़ोटो {number}" },
  setupTitle: { en: "What produces the result", hi: "नतीजा कैसे बनता है" },
  setupLead: {
    en: "No dedicated machine: the demo sample was imaged with this setup.",
    hi: "कोई अलग मशीन नहीं: डेमो नमूने की फ़ोटो इसी व्यवस्था से ली गई।",
  },
  faqTitle: {
    en: "Grain impurity analysis, answered",
    hi: "अनाज अशुद्धि विश्लेषण: सवाल-जवाब",
  },
  bandTitle: {
    en: "Want to see it on your grain?",
    hi: "इसे अपने अनाज पर देखना चाहते हैं?",
  },
  bandText: {
    en: "Book a short walkthrough with our grain analysis team.",
    hi: "हमारी अनाज विश्लेषण टीम के साथ छोटा डेमो बुक करें।",
  },
  bookWalkthrough: { en: "Book a live walkthrough", hi: "लाइव डेमो बुक करें" },

  // Legend
  sound: { en: "Sound", hi: "स्वस्थ" },
  defectOrImpurity: { en: "Defect or impurity", hi: "दोष या अशुद्धि" },
  unclear: { en: "Unclear", hi: "अस्पष्ट" },

  // Kernel detail
  tapKernel: {
    en: "Tap any kernel on the photo to see what Claude saw and what the operator decided.",
    hi: "फ़ोटो में किसी भी दाने पर टैप करें और देखें कि Claude ने क्या देखा और ऑपरेटर ने क्या तय किया।",
  },
  kernelAlt: { en: "Kernel {number}", hi: "दाना {number}" },
  kernelTitle: {
    en: "Kernel #{number} · cell {cell}",
    hi: "दाना #{number} · ख़ाना {cell}",
  },
  claudeSaid: { en: "Claude: {cls}", hi: "Claude: {cls}" },
  claudeSaidConfidence: {
    en: "Claude: {cls} ({confidence} confidence)",
    hi: "Claude: {cls} ({confidence} भरोसा)",
  },
  confidenceHigh: { en: "high", hi: "उच्च" },
  confidenceMedium: { en: "medium", hi: "मध्यम" },
  confidenceLow: { en: "low", hi: "कम" },
  checked: { en: "Checked by the operator", hi: "ऑपरेटर ने जाँचा" },
  notFlagged: {
    en: "Not flagged for checking",
    hi: "जाँच के लिए चिह्नित नहीं",
  },

  // Results
  resultsTitle: {
    en: "{crop} sample #{number}",
    hi: "{crop} नमूना #{number}",
  },
  grade: { en: " · grade {grade}", hi: " · ग्रेड {grade}" },
  category: { en: "Category", hi: "श्रेणी" },
  photoEstimate: { en: "Photo estimate", hi: "फ़ोटो अनुमान" },
  weighed: { en: "Weighed", hi: "तौला गया" },
  purity: { en: "Purity (sound grain)", hi: "शुद्धता (स्वस्थ दाने)" },
  seeReport: {
    en: "See this sample's verified report ({code})",
    hi: "इस नमूने की सत्यापित रिपोर्ट देखें ({code})",
  },
  resultsNote: {
    en: "The estimate comes from kernel areas in the photos; the weighed column from the operator's scale.",
    hi: "अनुमान फ़ोटो में दानों के क्षेत्रफल से आता है; तौल वाला कॉलम ऑपरेटर के तराज़ू से।",
  },
});
