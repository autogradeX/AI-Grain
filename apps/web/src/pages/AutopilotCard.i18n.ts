import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: { en: "Autopilot", hi: "ऑटोपायलट" },
  working: { en: "AI is working", hi: "AI काम कर रहा है" },
  needsYou: { en: "Needs you", hi: "आपकी ज़रूरत है" },
  done: { en: "Done", hi: "पूरा" },
  waitingPhotos: { en: "Waiting for photos", hi: "फ़ोटो का इंतज़ार" },
  stepPhotos: { en: "Photos", hi: "फ़ोटो" },
  photos_one: { en: "{count} photo", hi: "{count} फ़ोटो" },
  photos_other: { en: "{count} photos", hi: "{count} फ़ोटो" },
  noPhotosYet: { en: "None yet", hi: "अभी नहीं" },
  stepAi: { en: "Found and classified", hi: "पहचाने और वर्गीकृत" },
  kernels_one: { en: "{count} kernel", hi: "{count} दाना" },
  kernels_other: { en: "{count} kernels", hi: "{count} दाने" },
  stepCheck: { en: "Second opinion", hi: "दूसरी राय" },
  checkDetail: {
    en: "Every defect checked twice",
    hi: "हर दोष दो बार जाँचा गया",
  },
  stepReview: { en: "Your review", hi: "आपकी समीक्षा" },
  reviewWaiting_one: { en: "{count} kernel waiting", hi: "{count} दाना बाकी" },
  reviewWaiting_other: {
    en: "{count} kernels waiting",
    hi: "{count} दाने बाकी",
  },
  reviewDone: { en: "Nothing waiting", hi: "कुछ बाकी नहीं" },
  stepReport: { en: "Report", hi: "रिपोर्ट" },
  reportReady: { en: "Issued", hi: "जारी" },
  reportAuto: { en: "Issued automatically", hi: "अपने आप जारी होगी" },
  reportWaiting: { en: "After the last photo", hi: "आख़िरी फ़ोटो के बाद" },
  share: {
    en: "{pct}% of kernels handled by AI",
    hi: "{pct}% दाने AI ने सँभाले",
  },
  forYou_one: {
    en: "{count} kernel needs your eyes:",
    hi: "{count} दाने को आपकी नज़र चाहिए:",
  },
  forYou_other: {
    en: "{count} kernels need your eyes:",
    hi: "{count} दानों को आपकी नज़र चाहिए:",
  },
  review_one: { en: "Review {count} kernel", hi: "{count} दाना जाँचें" },
  review_other: { en: "Review {count} kernels", hi: "{count} दाने जाँचें" },
  addPhoto: { en: "Add photo", hi: "फ़ोटो जोड़ें" },
  allPhotos: {
    en: "That's all the photos: finish",
    hi: "बस इतनी ही फ़ोटो: पूरा करें",
  },
  finishing: {
    en: "Autopilot finishes this sample by itself once nothing waits on you.",
    hi: "जब आपके लिए कुछ बाकी नहीं रहेगा, ऑटोपायलट यह नमूना अपने आप पूरा करेगा।",
  },
  finishingNow: {
    en: "Finishing: result, report and summary…",
    hi: "पूरा हो रहा है: परिणाम, रिपोर्ट और सारांश…",
  },
  completedByAutopilot: {
    en: "Completed by Autopilot on the photo estimate. Weigh the cups below to verify it with the scale.",
    hi: "ऑटोपायलट ने फ़ोटो अनुमान पर पूरा किया। स्केल से पुष्टि के लिए नीचे कप तौलें।",
  },
  completedByAutopilotWeighed: {
    en: "Completed by Autopilot.",
    hi: "ऑटोपायलट ने पूरा किया।",
  },
  waitingFor: { en: "Still needed: {list}", hi: "अभी ज़रूरी: {list}" },
  failedPhoto: {
    en: "A photo couldn't be processed: open it to re-mark the corners or delete it.",
    hi: "एक फ़ोटो प्रोसेस नहीं हो सकी: कोने दोबारा चिह्नित करने या हटाने के लिए उसे खोलें।",
  },
});
