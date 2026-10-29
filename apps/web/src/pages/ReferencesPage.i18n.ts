import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Reference images", hi: "संदर्भ चित्र" },
  intro: {
    en: "Close-ups of kernels from your own grain, one per defect type or more. Up to 12 per crop, spread across classes, are sent to Claude with every request. They improve accuracy more than anything else you can add. The quickest way to add one is “Use as a reference example” on a reviewed kernel.",
    hi: "अपने ही अनाज के दानों के नज़दीकी फ़ोटो, हर दोष के लिए कम से कम एक। हर फ़सल के 12 तक चित्र, अलग-अलग वर्गों से, हर अनुरोध के साथ Claude को भेजे जाते हैं। सटीकता बढ़ाने का यह सबसे असरदार तरीका है। सबसे जल्दी तरीका: जाँचे गए दाने पर “संदर्भ उदाहरण के रूप में उपयोग करें” दबाएँ।",
  },
  crop: { en: "Crop", hi: "फ़सल" },
  remove: { en: "Remove", hi: "हटाएँ" },
  empty: {
    en: "No reference images for {crop} yet.",
    hi: "{crop} के लिए अभी कोई संदर्भ चित्र नहीं है।",
  },
  addTitle: { en: "Add from a photo", hi: "फ़ोटो से जोड़ें" },
  addHint: {
    en: "Use a close-up of a single kernel, cropped square, on the same dark board.",
    hi: "एक ही दाने का नज़दीकी फ़ोटो लें, चौकोर काटा हुआ, उसी गहरे बोर्ड पर।",
  },
  cls: { en: "Class", hi: "वर्ग" },
  note: { en: "Note (optional)", hi: "टिप्पणी (वैकल्पिक)" },
  notePlaceholder: { en: "e.g. early sprouting", hi: "जैसे: शुरुआती अंकुरण" },
  chooseImage: { en: "Choose image", hi: "चित्र चुनें" },
});
