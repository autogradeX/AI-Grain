import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "This station", hi: "यह स्टेशन" },
  intro: {
    en: "This computer runs AI-Grain for the mandi. Phones and tablets on the same Wi-Fi open it at the address below (no internet needed): scan the code with the phone's camera.",
    hi: "यह कंप्यूटर मंडी के लिए AI-Grain चलाता है। उसी Wi-Fi पर फ़ोन और टैबलेट इसे नीचे दिए पते पर खोलते हैं (इंटरनेट ज़रूरी नहीं): फ़ोन के कैमरे से कोड स्कैन करें।",
  },
  noAddress: {
    en: "No network address found: connect this computer to the Wi-Fi router.",
    hi: "नेटवर्क पता नहीं मिला: इस कंप्यूटर को Wi-Fi राउटर से जोड़ें।",
  },
  qr: { en: "Code to open the station", hi: "स्टेशन खोलने का कोड" },
  offline: {
    en: "Without internet: counting, sizes, weighing, review, reports and printing work as usual. Classification waits and carries on by itself when the internet is back, and results are sent to the central server then.",
    hi: "इंटरनेट के बिना: गिनती, आकार, तौल, समीक्षा, रिपोर्ट और प्रिंटिंग सामान्य रूप से चलते हैं। वर्गीकरण इंतज़ार करता है और इंटरनेट लौटते ही अपने आप आगे बढ़ता है, और तब परिणाम केंद्रीय सर्वर को भेजे जाते हैं।",
  },
});
