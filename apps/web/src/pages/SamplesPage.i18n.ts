import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Samples", hi: "नमूने" },
  exportCsv: { en: "Export CSV", hi: "CSV निर्यात करें" },
  newSample: { en: "New sample", hi: "नया नमूना" },
  all: { en: "All", hi: "सभी" },
  inProgress: { en: "In progress", hi: "जारी" },
  completed: { en: "Completed", hi: "पूर्ण" },
  search: {
    en: "Search number, crop or source",
    hi: "नंबर, फसल या स्रोत से खोजें",
  },
  noSamples: { en: "No samples yet.", hi: "अभी कोई नमूना नहीं है।" },
  noSamplesHint: {
    en: "Set up a grading standard first, then create a sample for each lot you screen.",
    hi: "पहले ग्रेडिंग मानक बनाएँ, फिर जाँचे जाने वाले हर लॉट के लिए एक नमूना बनाएँ।",
  },
  noStandard: { en: "No standard", hi: "कोई मानक नहीं" },
  grade: { en: "Grade {grade}", hi: "ग्रेड {grade}" },
  noGrade: { en: "No grade", hi: "कोई ग्रेड नहीं" },
  defects: { en: "{pct} defects", hi: "{pct} दोष" },
  previous: { en: "Previous", hi: "पिछला" },
  next: { en: "Next", hi: "अगला" },
  range: { en: "{from}–{to} of {total}", hi: "{total} में से {from}–{to}" },
  crop: { en: "Crop", hi: "फसल" },
  standard: { en: "Standard", hi: "मानक" },
  noStandardHint: {
    en: "No standard for this crop yet: results get percentages but no grade.",
    hi: "इस फसल का अभी कोई मानक नहीं: परिणाम में प्रतिशत आएँगे, पर ग्रेड नहीं।",
  },
  source: { en: "Source (farm, lot, truck)", hi: "स्रोत (खेत, लॉट, ट्रक)" },
  mass: {
    en: "Working sample mass (g)",
    hi: "जाँच नमूने का वज़न (g)",
  },
  massHint: {
    en: "Weigh 20–25 g on the 0.01 g scale (about 500–600 wheat kernels).",
    hi: "0.01 g वाले तराज़ू पर 20–25 g तौलें (गेहूँ के लगभग 500–600 दाने)।",
  },
  createSample: { en: "Create sample", hi: "नमूना बनाएँ" },
});
