import { defineMessages } from "../i18n";

export const m = defineMessages({
  read: {
    en: "Read from the moisture meter (press its print or test key)",
    hi: "नमी मीटर से पढ़ें (उसकी प्रिंट या टेस्ट कुंजी दबाएँ)",
  },
  reading: { en: "Waiting for the meter…", hi: "मीटर का इंतज़ार…" },
  failed: {
    en: "No reading from the moisture meter. Check the cable and the speed (baud rate), then try again.",
    hi: "नमी मीटर से कोई रीडिंग नहीं। केबल और गति (बॉड रेट) जाँचें, फिर से कोशिश करें।",
  },
});
