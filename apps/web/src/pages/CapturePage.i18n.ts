import { defineMessages } from "../i18n";

export const m = defineMessages({
  notAnImage: {
    en: "That file is not an image the browser can open",
    hi: "यह फ़ाइल ऐसा चित्र नहीं है जिसे ब्राउज़र खोल सके",
  },
  backToSample: { en: "← Back to sample", hi: "← नमूने पर वापस" },
  title: { en: "Add a board photo", hi: "बोर्ड की फ़ोटो जोड़ें" },
  stepSpread: {
    en: "Spread about 100–150 kernels on the board in one layer, not touching.",
    hi: "बोर्ड पर लगभग 100–150 दाने एक परत में फैलाएँ, एक-दूसरे को छूते हुए नहीं।",
  },
  stepStand: {
    en: "Fix the phone flat on the stand, 20–25 cm above the board.",
    hi: "फ़ोन को स्टैंड पर सीधा, बोर्ड से 20–25 cm ऊपर लगाएँ।",
  },
  stepLight: {
    en: "Light evenly from two sides at 45°, or with a ring light. No shadows, no direct sun.",
    hi: "दो तरफ़ से 45° पर या रिंग लाइट से एक-सी रोशनी करें। कोई परछाईं नहीं, सीधी धूप नहीं।",
  },
  stepCells: {
    en: "Make sure every grid cell, A1 to T28, is in the picture.",
    hi: "ध्यान रखें कि ग्रिड का हर खाना, A1 से T28 तक, फ़ोटो में आए।",
  },
  takePhoto: { en: "Take photo", hi: "फ़ोटो लें" },
  liveCamera: {
    en: "Live camera with alignment guide",
    hi: "सीध मिलाने वाली गाइड के साथ लाइव कैमरा",
  },
  choosePhoto: {
    en: "Choose an existing photo",
    hi: "पहले से ली गई फ़ोटो चुनें",
  },
  markCorners: {
    en: "Mark the grid corners",
    hi: "ग्रिड के कोने चिह्नित करें",
  },
  markCornersHint: {
    en: "Drag each handle onto the outer corner of the grid: A1 top left, T1 top right, T28 bottom right, A28 bottom left. The blue lines should sit on the printed grid.",
    hi: "हर हैंडल को खींचकर ग्रिड के बाहरी कोने पर रखें: A1 ऊपर बाएँ, T1 ऊपर दाएँ, T28 नीचे दाएँ, A28 नीचे बाएँ। नीली रेखाएँ छपी हुई ग्रिड पर बैठनी चाहिए।",
  },
  whichSide: {
    en: "Which side of the kernels is up?",
    hi: "दानों की कौन-सी तरफ़ ऊपर है?",
  },
  sideFront: { en: "Top side (first photo)", hi: "ऊपरी तरफ़ (पहली फ़ोटो)" },
  sideCrease: {
    en: "Crease side (kernels flipped)",
    hi: "खाँचे वाली तरफ़ (दाने पलटे हुए)",
  },
  retake: { en: "Retake", hi: "दोबारा लें" },
  uploading: { en: "Uploading…", hi: "अपलोड हो रहा है…" },
  findKernels: { en: "Find kernels", hi: "दाने खोजें" },
  checkPhoto: { en: "Check the photo", hi: "फ़ोटो जाँचें" },
  photoPreview: { en: "The board photo", hi: "बोर्ड की फ़ोटो" },
  autoCornersHint: {
    en: "The grid's corners are found automatically: keep the whole board in the photo, on a lighter surface. No board? Plain paper or cloth that contrasts with the kernels works too, but kernel sizes in mm need the board.",
    hi: "ग्रिड के कोने अपने आप ढूँढे जाते हैं: पूरा बोर्ड फ़ोटो में रखें, हल्के रंग की सतह पर। बोर्ड नहीं है? दानों से अलग रंग का सादा काग़ज़ या कपड़ा भी चलेगा, पर दानों का आकार मिमी में बोर्ड से ही मिलता है।",
  },
  markMyself: {
    en: "Mark the corners myself",
    hi: "कोने मैं ख़ुद चिह्नित करूँगा",
  },
  savedOnDevice_one: {
    en: "Photo saved on this device",
    hi: "फ़ोटो इस डिवाइस पर सहेजी गई",
  },
  savedOnDevice_other: {
    en: "{count} photos saved on this device",
    hi: "{count} फ़ोटो इस डिवाइस पर सहेजी गईं",
  },
  savedOnDeviceHint: {
    en: "There's no connection. The upload starts by itself when you're back online, and Autopilot carries on from there.",
    hi: "कनेक्शन नहीं है। ऑनलाइन होते ही अपलोड अपने आप शुरू होगा, और फिर ऑटोपायलट आगे बढ़ेगा।",
  },
  anotherPhoto: { en: "Take another photo", hi: "एक और फ़ोटो लें" },
  toSamples: { en: "Back to samples", hi: "नमूनों पर वापस" },
  sideAuto: {
    en: "Detect it from the photo",
    hi: "फ़ोटो से पहचानें",
  },
  manyHint: {
    en: "You can choose several photos at once: each becomes its own batch.",
    hi: "आप एक साथ कई फ़ोटो चुन सकते हैं: हर फ़ोटो अपना बैच बनेगी।",
  },
  manyTitle_one: { en: "{count} photo", hi: "{count} फ़ोटो" },
  manyTitle_other: { en: "{count} photos", hi: "{count} फ़ोटो" },
  photoN: { en: "Photo {n}", hi: "फ़ोटो {n}" },
  batchN: { en: "Batch {n}", hi: "बैच {n}" },
  manyAutoHint: {
    en: "Each photo becomes a batch. Grid corners and the kernels' side are found automatically.",
    hi: "हर फ़ोटो एक बैच बनेगी। ग्रिड के कोने और दानों की तरफ़ अपने आप पहचानी जाती है।",
  },
  lastPhotos: {
    en: "These are all the photos of the sample: finish automatically",
    hi: "नमूने की बस यही फ़ोटो हैं: अपने आप पूरा करें",
  },
  uploadingN: {
    en: "Uploading {n} of {total}…",
    hi: "{total} में से {n} अपलोड हो रही है…",
  },
  findKernelsMany_one: {
    en: "Find kernels in {count} photo",
    hi: "{count} फ़ोटो में दाने खोजें",
  },
  findKernelsMany_other: {
    en: "Find kernels in {count} photos",
    hi: "{count} फ़ोटो में दाने खोजें",
  },
  lastPhoto: {
    en: "This is the last photo of the sample: finish automatically",
    hi: "यह नमूने की आख़िरी फ़ोटो है: अपने आप पूरा करें",
  },
});
