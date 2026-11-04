import { defineMessages } from "../i18n";

export const m = defineMessages({
  open: { en: "Import lab results", hi: "लैब परिणाम आयात करें" },
  title: {
    en: "Import a reference lab's results",
    hi: "संदर्भ लैब के परिणाम आयात करें",
  },
  hint: {
    en: 'A CSV from the lab, one row per sample: a "Sample" (sample number) or "Lot" (e-NAM lot ID) column, then columns named after classes (their name or id, in %), and any of "Grade", "Lab", "Report no", "Date" (YYYY-MM-DD), "Moisture", "Protein" and "Oil". It becomes the reference result of each sample.',
    hi: 'लैब की CSV, हर नमूने की एक पंक्ति: "Sample" (नमूना संख्या) या "Lot" (ई-नाम लॉट आईडी) कॉलम, फिर वर्गों के नाम वाले कॉलम (% में), और "Grade", "Lab", "Report no", "Date" (YYYY-MM-DD), "Moisture", "Protein", "Oil" में से कोई भी। यह हर नमूने का संदर्भ परिणाम बनता है।',
  },
  file: { en: "CSV file", hi: "CSV फ़ाइल" },
  preview: { en: "Check the file", hi: "फ़ाइल जाँचें" },
  apply: { en: "Save {count} results", hi: "{count} परिणाम सहेजें" },
  applied: {
    en: "Saved reference results for {count} samples.",
    hi: "{count} नमूनों के संदर्भ परिणाम सहेजे गए।",
  },
  ignored: {
    en: "Columns not used (no class or field of that name): {list}",
    hi: "इस्तेमाल न हुए कॉलम (इस नाम का कोई वर्ग या फ़ील्ड नहीं): {list}",
  },
  line: { en: "Line", hi: "पंक्ति" },
  sample: { en: "Sample", hi: "नमूना" },
  classes: { en: "Classes", hi: "वर्ग" },
  status: { en: "Status", hi: "स्थिति" },
  ready: { en: "Ready", hi: "तैयार" },
  close: { en: "Close", hi: "बंद करें" },
});
