import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Training dataset", hi: "प्रशिक्षण डेटासेट" },
  intro: {
    en: "Every kernel an operator confirmed or corrected is a labelled training image. This is the cheapest way to build the dataset a dedicated grading machine needs. Corrections are the most valuable labels: they are where Claude was wrong.",
    hi: "ऑपरेटर ने जिस भी दाने की पुष्टि या सुधार किया, वह लेबल वाला प्रशिक्षण चित्र है। किसी अलग ग्रेडिंग मशीन के लिए ज़रूरी डेटासेट बनाने का यह सबसे सस्ता तरीका है। सुधार सबसे कीमती लेबल हैं: वहीं Claude गलत था।",
  },
  empty: {
    en: "No reviewed kernels yet.",
    hi: "अभी तक कोई दाना जाँचा नहीं गया।",
  },
  cardTitle_one: {
    en: "{crop} · {count} labelled kernel",
    hi: "{crop} · {count} लेबल वाला दाना",
  },
  cardTitle_other: {
    en: "{crop} · {count} labelled kernels",
    hi: "{crop} · {count} लेबल वाले दाने",
  },
  downloadZip: { en: "Download ZIP", hi: "ZIP डाउनलोड करें" },
  cls: { en: "Class", hi: "वर्ग" },
  labels: { en: "Labels", hi: "लेबल" },
  corrected: { en: "Corrected from Claude", hi: "Claude से सुधारे गए" },
});
