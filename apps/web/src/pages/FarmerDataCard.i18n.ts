import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Farmers' data", hi: "किसानों का डेटा" },
  hint: {
    en: "Samples can hold a farmer's name, ID and mobile. Under India's data protection law (DPDP Act) a farmer may ask what you hold about them and to have it erased; keep it only as long as you need it. Results and grades stay: they are about the grain.",
    hi: "नमूनों में किसान का नाम, आईडी और मोबाइल हो सकता है। भारत के डेटा संरक्षण कानून (DPDP अधिनियम) के तहत किसान पूछ सकता है कि आपके पास उसका क्या है और उसे मिटाने को कह सकता है; इसे केवल ज़रूरत तक रखें। परिणाम और ग्रेड बने रहते हैं: वे अनाज के बारे में हैं।",
  },
  retention: {
    en: "Clear farmers' details this many days after a sample is completed",
    hi: "नमूना पूरा होने के इतने दिन बाद किसानों का विवरण मिटा दें",
  },
  retentionHint: { en: "Empty: keep them", hi: "खाली: रखें" },
  saveRetention: { en: "Save", hi: "सहेजें" },
  saved: { en: "Saved", hi: "सहेजा गया" },
  requestTitle: { en: "A farmer's request", hi: "किसान का अनुरोध" },
  mobile: { en: "Farmer's mobile", hi: "किसान का मोबाइल" },
  farmerId: { en: "or farmer ID", hi: "या किसान आईडी" },
  download: { en: "Download their data", hi: "उनका डेटा डाउनलोड करें" },
  erase: { en: "Erase their details", hi: "उनका विवरण मिटाएँ" },
  confirmErase: {
    en: "Erase this farmer's name, ID and mobile from every sample? Results stay. This can't be undone.",
    hi: "हर नमूने से इस किसान का नाम, आईडी और मोबाइल मिटाएँ? परिणाम बने रहेंगे। इसे वापस नहीं किया जा सकता।",
  },
  erased: {
    en: "Erased from {count} samples.",
    hi: "{count} नमूनों से मिटाया गया।",
  },
  certNote: {
    en: "Certificates already issued keep the lot as it was signed; their public page never shows the mobile, and only the last 4 characters of the farmer ID.",
    hi: "पहले जारी प्रमाणपत्रों में लॉट वैसा ही रहता है जैसा हस्ताक्षरित हुआ था; उनके सार्वजनिक पेज पर मोबाइल कभी नहीं दिखता, और किसान आईडी के केवल आख़िरी 4 अक्षर दिखते हैं।",
  },
});
