import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Repeatability", hi: "दोहराव की सटीकता" },
  intro: {
    en: "Each pair is the same physical sample run twice (Repeat this sample on a sample page). Agreement is the share of the mass both runs put in the same class.",
    hi: "हर जोड़ी एक ही नमूने के दो रन हैं (नमूना पेज पर 'यह नमूना दोहराएँ')। सहमति: दोनों रन में एक ही वर्ग में गया भार का हिस्सा।",
  },
  none: {
    en: "No completed repeat runs yet. Open a completed sample and choose Repeat this sample.",
    hi: "अभी कोई पूरा दोहराया रन नहीं। कोई पूरा नमूना खोलें और 'यह नमूना दोहराएँ' चुनें।",
  },
  pairs_one: { en: "{count} pair", hi: "{count} जोड़ी" },
  pairs_other: { en: "{count} pairs", hi: "{count} जोड़ियाँ" },
  mean: { en: "Mean agreement", hi: "औसत सहमति" },
  lowest: { en: "Lowest", hi: "सबसे कम" },
  band99: { en: "99% or more", hi: "99% या अधिक" },
  band97: { en: "97–99%", hi: "97–99%" },
  band95: { en: "95–97%", hi: "95–97%" },
  bandLow: { en: "below 95%", hi: "95% से कम" },
  pair: { en: "#{first} and #{repeat}", hi: "#{first} और #{repeat}" },
  agreement: { en: "Agreement", hi: "सहमति" },
  maxDiff: { en: "Largest difference", hi: "सबसे बड़ा अंतर" },
  points: { en: "{value} points", hi: "{value} अंक" },
});
