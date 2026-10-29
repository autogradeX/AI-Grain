import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Crops and classes", hi: "फ़सलें और वर्ग" },
  intro: {
    en: "Each crop has its own defect classes in four groups: grain admixtures, broken & defective, impurities & foreign material, and harmful & disease. Claude sorts every kernel into one of them, and standards set limits per class and per group. Wheat, barley, oats, rapeseed and hemp start from presets you can change.",
    hi: "हर फ़सल के अपने दोष-वर्ग होते हैं, चार समूहों में: अन्य अनाज की मिलावट, टूटे व दोषपूर्ण दाने, अशुद्धियाँ व बाहरी पदार्थ, और हानिकारक व रोगग्रस्त। Claude हर दाने को इनमें से किसी एक वर्ग में रखता है, और मानक हर वर्ग व हर समूह की सीमा तय करते हैं। गेहूँ, जौ, जई, सरसों और भांग पहले से बनी सूचियों से शुरू होते हैं, जिन्हें आप बदल सकते हैं।",
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
  description: { en: "Description for Claude", hi: "Claude के लिए विवरण" },
  descriptionHint: {
    en: "Written in English works best: Claude reads it.",
    hi: "अंग्रेज़ी में लिखना सबसे अच्छा है: इसे Claude पढ़ता है।",
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
