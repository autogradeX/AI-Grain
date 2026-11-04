import { defineMessages } from "../i18n";

export const m = defineMessages({
  open: { en: "Import NIR results", hi: "NIR परिणाम आयात करें" },
  title: {
    en: "Import from an NIR analyser or moisture meter",
    hi: "NIR विश्लेषक या नमी मीटर से आयात",
  },
  hint: {
    en: 'Choose the CSV your instrument exports. It needs a "Sample" column (sample number) or a "Lot" column (e-NAM lot ID), and any of "Protein", "Oil" and "Moisture". Only samples still in progress take values.',
    hi: 'अपने उपकरण की निर्यात की हुई CSV चुनें। इसमें "Sample" (नमूना संख्या) या "Lot" (ई-नाम लॉट आईडी) कॉलम, और "Protein", "Oil", "Moisture" में से कोई कॉलम होना चाहिए। केवल जारी नमूनों में मान डाले जाते हैं।',
  },
  file: { en: "CSV file", hi: "CSV फ़ाइल" },
  preview: { en: "Check the file", hi: "फ़ाइल जाँचें" },
  apply: { en: "Apply {count} rows", hi: "{count} पंक्तियाँ लागू करें" },
  applied: {
    en: "Values saved for {count} samples.",
    hi: "{count} नमूनों के मान सहेजे गए।",
  },
  line: { en: "Line", hi: "पंक्ति" },
  sample: { en: "Sample", hi: "नमूना" },
  values: { en: "Values", hi: "मान" },
  status: { en: "Status", hi: "स्थिति" },
  ready: { en: "Ready", hi: "तैयार" },
  protein: { en: "protein", hi: "प्रोटीन" },
  oil: { en: "oil", hi: "तेल" },
  moisture: { en: "moisture", hi: "नमी" },
  close: { en: "Close", hi: "बंद करें" },
});
