import { defineMessages } from "../i18n";

export const m = defineMessages({
  sizeTitle: { en: "Kernel size", hi: "दाने का आकार" },
  sizeNote: {
    en: "Measured in the photos on {count} sound kernels: length is the longest dimension, breadth the widest across it.",
    hi: "फ़ोटो में {count} स्वस्थ दानों पर मापा गया: लंबाई सबसे लंबा माप, चौड़ाई उसके आर-पार सबसे चौड़ा।",
  },
  length: { en: "Length", hi: "लंबाई" },
  breadth: { en: "Breadth", hi: "चौड़ाई" },
  lb: { en: "L/B ratio", hi: "L/B अनुपात" },
  range: { en: "Range", hi: "सीमा" },
  mm: { en: "{value} mm", hi: "{value} मिमी" },
  spread: { en: "± {value}", hi: "± {value}" },
  repeatTitle: { en: "Repeatability", hi: "दोहराव की सटीकता" },
  repeatHint: {
    en: "Run the same physical sample again to check that results repeat. Agreement is the share of the mass both runs put in the same class.",
    hi: "परिणाम दोहराए जाते हैं, यह जाँचने के लिए वही नमूना फिर से चलाएँ। सहमति: दोनों रन में एक ही वर्ग में गया भार का हिस्सा।",
  },
  repeatButton: { en: "Repeat this sample", hi: "यह नमूना दोहराएँ" },
  runOf: { en: "Sample #{number}", hi: "नमूना #{number}" },
  agreement: { en: "{pct}% agreement", hi: "{pct}% सहमति" },
  maxDiff: {
    en: "largest difference {diff} points",
    hi: "सबसे बड़ा अंतर {diff} अंक",
  },
  notYet: {
    en: "not comparable yet (no result)",
    hi: "अभी तुलना नहीं (परिणाम नहीं)",
  },
  printReport: { en: "Print report", hi: "रिपोर्ट प्रिंट करें" },
  printSlip: { en: "Print slip (80 mm)", hi: "पर्ची प्रिंट करें (80 मिमी)" },
  resultFile: {
    en: "Result file (eNAM / ERP)",
    hi: "परिणाम फ़ाइल (eNAM / ERP)",
  },
});
