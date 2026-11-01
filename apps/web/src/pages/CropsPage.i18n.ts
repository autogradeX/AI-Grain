import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Crops and classes", hi: "फ़सलें और वर्ग" },
  intro: {
    en: "Each crop has its own defect classes in four groups: grain admixtures, broken & defective, impurities & foreign material, and harmful & disease. Model Orchestration sorts every kernel into one of them, and standards set limits per class and per group. Wheat, paddy, rice, maize, pulses and oilseeds start from ready-made lists you can change.",
    hi: "हर फ़सल के अपने दोष-वर्ग होते हैं, चार समूहों में: अन्य अनाज की मिलावट, टूटे व दोषपूर्ण दाने, अशुद्धियाँ व बाहरी पदार्थ, और हानिकारक व रोगग्रस्त। मॉडल ऑर्केस्ट्रेशन हर दाने को इनमें से किसी एक वर्ग में रखता है, और मानक हर वर्ग व हर समूह की सीमा तय करते हैं। गेहूँ, धान, चावल, मक्का, दालें और तिलहन पहले से बनी सूचियों से शुरू होते हैं, जिन्हें आप बदल सकते हैं।",
  },
  archived: { en: "Archived", hi: "संग्रहित" },
  groupCount: { en: "{count} {group}", hi: "{count} {group}" },
  classes_one: { en: "{count} class", hi: "{count} वर्ग" },
  classes_other: { en: "{count} classes", hi: "{count} वर्ग" },
  addCropTitle: { en: "Add a crop", hi: "फ़सल जोड़ें" },
  addCropPlaceholder: {
    en: "e.g. triticale, sunflower",
    hi: "जैसे: ट्रिटिकेल, सूरजमुखी",
  },
  addCrop: { en: "Add crop", hi: "फ़सल जोड़ें" },
  readyMade: { en: "Ready-made:", hi: "तैयार सूचियाँ:" },
  suggesting: {
    en: "Model Orchestration is suggesting…",
    hi: "मॉडल ऑर्केस्ट्रेशन सुझा रहा है…",
  },
  addCropAiHint: {
    en: "Type the grain's name (any language, e.g. rajma, moong, sunflower). Model Orchestration suggests its name and defect classes with descriptions and mass factors; you review them next.",
    hi: "अनाज का नाम लिखें (किसी भी भाषा में, जैसे राजमा, मूँग, सूरजमुखी)। मॉडल ऑर्केस्ट्रेशन उसका नाम और विवरण व भार-गुणक सहित दोष-वर्ग सुझाता है; आगे आप उन्हें जाँचते हैं।",
  },
  addPlain: {
    en: "Add it with the general list instead",
    hi: "इसके बजाय सामान्य सूची से जोड़ें",
  },
  suggestedNote: {
    en: "Name and classes suggested by Model Orchestration. Check them, change anything that doesn't fit, and save.",
    hi: "नाम और वर्ग मॉडल ऑर्केस्ट्रेशन ने सुझाए हैं। इन्हें जाँचें, जो ठीक न लगे उसे बदलें, और सहेजें।",
  },
  suggestClasses: { en: "Suggest classes", hi: "वर्ग सुझाएँ" },
  offer: {
    en: "Suggested for {label}: {count} classes",
    hi: "{label} के लिए सुझाव: {count} वर्ग",
  },
  replaceList: { en: "Replace the list", hi: "सूची बदलें" },
  addMissing_one: {
    en: "Add the {count} missing class",
    hi: "छूटा हुआ {count} वर्ग जोड़ें",
  },
  addMissing_other: {
    en: "Add the {count} missing classes",
    hi: "छूटे हुए {count} वर्ग जोड़ें",
  },
  discard: { en: "Discard", hi: "छोड़ें" },
  delete: { en: "Delete crop", hi: "फ़सल हटाएँ" },
  deleteCrop: { en: "Delete {name}", hi: "{name} हटाएँ" },
  confirmDelete: {
    en: "Delete {name} and its classes? This can't be undone. A crop already used by samples, standards or reference images can only be archived.",
    hi: "{name} और उसके वर्ग हटाएँ? यह वापस नहीं होगा। जिस फ़सल का उपयोग नमूने, मानक या संदर्भ चित्र कर रहे हैं, उसे केवल संग्रहित किया जा सकता है।",
  },
  offerHint: {
    en: "Nothing changes until you save. Classes already used by samples or standards can't be removed.",
    hi: "सहेजने तक कुछ नहीं बदलता। जिन वर्गों का उपयोग नमूने या मानक कर रहे हैं, उन्हें हटाया नहीं जा सकता।",
  },
  addCropHint: {
    en: "It starts with the general cereal class list ({presets} have their own); edit it to fit.",
    hi: "यह अनाज की सामान्य वर्ग-सूची से शुरू होती है ({presets} की अपनी सूची है); ज़रूरत के हिसाब से बदलें।",
  },
  notFound: { en: "Crop not found", hi: "फ़सल नहीं मिली" },
  backToCrops: { en: "← Crops", hi: "← फ़सलें" },
  key: { en: "Key: {key}", hi: "कुंजी: {key}" },
  crop: { en: "Crop", hi: "फ़सल" },
  name: { en: "Name", hi: "नाम" },
  addClass: { en: "Add class", hi: "वर्ग जोड़ें" },
  noClasses: {
    en: "No classes in this group.",
    hi: "इस समूह में कोई वर्ग नहीं।",
  },
  group: { en: "Group", hi: "समूह" },
  massFactor: { en: "Mass factor", hi: "भार गुणक" },
  massFactorHint: {
    en: "For the photo estimate: weight relative to a sound kernel of the same size. Empty = 1.",
    hi: "फ़ोटो अनुमान के लिए: समान आकार के स्वस्थ दाने की तुलना में वज़न। खाली = 1।",
  },
  description: {
    en: "Description for Model Orchestration",
    hi: "मॉडल ऑर्केस्ट्रेशन के लिए विवरण",
  },
  descriptionHint: {
    en: "Written in English works best: Model Orchestration reads it.",
    hi: "अंग्रेज़ी में लिखना सबसे अच्छा है: इसे मॉडल ऑर्केस्ट्रेशन पढ़ता है।",
  },
  id: { en: "id: {id}", hi: "id: {id}" },
  moveUp: { en: "Move up", hi: "ऊपर करें" },
  moveDown: { en: "Move down", hi: "नीचे करें" },
  remove: { en: "Remove", hi: "हटाएँ" },
  saved: { en: "Saved.", hi: "सहेजा गया।" },
  restore: { en: "Restore crop", hi: "फ़सल वापस लाएँ" },
  archive: { en: "Archive crop", hi: "फ़सल संग्रहित करें" },
  saveClasses: { en: "Save classes", hi: "वर्ग सहेजें" },
});
