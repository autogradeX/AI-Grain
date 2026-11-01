import { defineMessages } from "../i18n";

export const m = defineMessages({
  cluster: { en: "Touching kernels", hi: "सटे हुए दाने" },
  unclear: { en: "AI unsure of the class", hi: "AI वर्ग को लेकर अनिश्चित" },
  low_confidence: { en: "Low confidence", hi: "कम भरोसा" },
  medium_confidence: {
    en: "Not confirmed by a second look",
    hi: "दूसरी जाँच से पुष्टि नहीं हुई",
  },
  defect: { en: "Defect to confirm", hi: "पुष्टि के लिए दोष" },
  harmful: {
    en: "Harmful: always checked",
    hi: "हानिकारक: हमेशा जाँचा जाता है",
  },
  disagreement: {
    en: "Two AI passes disagreed",
    hi: "AI की दो जाँचें असहमत थीं",
  },
  spot_check: { en: "Random spot check", hi: "यादृच्छिक जाँच" },
});
