import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: {
    en: "Sample saved on this device",
    hi: "नमूना इस डिवाइस पर सहेजा गया",
  },
  intro: {
    en: "There's no connection. Take the board photos now: everything uploads by itself when you're back online, and Autopilot carries on from there.",
    hi: "कनेक्शन नहीं है। बोर्ड की फ़ोटो अभी लें: ऑनलाइन होते ही सब अपने आप अपलोड होगा, और फिर ऑटोपायलट आगे बढ़ेगा।",
  },
  crop: { en: "Crop", hi: "फ़सल" },
  lot: { en: "Lot", hi: "लॉट" },
  takePhoto: { en: "Take a photo", hi: "फ़ोटो लें" },
  choosePhotos: { en: "Choose photos", hi: "फ़ोटो चुनें" },
  photos_one: { en: "{count} photo", hi: "{count} फ़ोटो" },
  photos_other: { en: "{count} photos", hi: "{count} फ़ोटो" },
  noPhotos: { en: "No photos yet.", hi: "अभी कोई फ़ोटो नहीं।" },
  allPhotos: {
    en: "That's all the photos: finish automatically",
    hi: "बस इतनी ही फ़ोटो: अपने आप पूरा करें",
  },
  willFinish: {
    en: "Autopilot finishes the sample after the last photo is uploaded.",
    hi: "आख़िरी फ़ोटो अपलोड होने के बाद ऑटोपायलट नमूना पूरा करेगा।",
  },
  remove: { en: "Remove", hi: "हटाएँ" },
  uploaded: {
    en: "This sample has been uploaded.",
    hi: "यह नमूना अपलोड हो गया है।",
  },
  openSample: { en: "Open sample #{number}", hi: "नमूना #{number} खोलें" },
  toSamples: { en: "Back to samples", hi: "नमूनों पर वापस" },
  refused: { en: "Refused: {reason}", hi: "अस्वीकृत: {reason}" },
});
