import { defineMessages } from "../i18n";

export const m = defineMessages({
  waiting: {
    en: "Saved on this device, waiting to upload: {list}.",
    hi: "इस डिवाइस पर सहेजा गया, अपलोड बाकी: {list}।",
  },
  samples_one: { en: "{count} sample", hi: "{count} नमूना" },
  samples_other: { en: "{count} samples", hi: "{count} नमूने" },
  photos_one: { en: "{count} photo", hi: "{count} फ़ोटो" },
  photos_other: { en: "{count} photos", hi: "{count} फ़ोटो" },
  refused_one: {
    en: "{count} photo was refused by the server",
    hi: "{count} फ़ोटो सर्वर ने अस्वीकार की",
  },
  refused_other: {
    en: "{count} photos were refused by the server",
    hi: "{count} फ़ोटो सर्वर ने अस्वीकार कीं",
  },
  uploadNow: { en: "Upload now", hi: "अभी अपलोड करें" },
  uploading: { en: "Uploading…", hi: "अपलोड हो रहा है…" },
});
