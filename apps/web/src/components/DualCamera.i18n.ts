import { defineMessages } from "../i18n";

export const m = defineMessages({
  title: {
    en: "Two cameras: top and bottom",
    hi: "दो कैमरे: ऊपर और नीचे",
  },
  hint: {
    en: "For a rig with a camera above and one below a glass tray, both on USB. Spread the kernels in one layer on the glass, light it evenly, and take both photos at once: each grain is counted once, and a defect seen only from below counts too.",
    hi: "ऐसे सेटअप के लिए जिसमें एक कैमरा कांच की ट्रे के ऊपर और एक नीचे हो, दोनों USB पर। दानों को कांच पर एक परत में फैलाएँ, समान रोशनी दें, और दोनों फ़ोटो एक साथ लें: हर दाना एक बार गिना जाता है, और केवल नीचे से दिखने वाला दोष भी गिना जाता है।",
  },
  top: { en: "Top camera", hi: "ऊपर का कैमरा" },
  bottom: {
    en: "Bottom camera (under the glass)",
    hi: "नीचे का कैमरा (कांच के नीचे)",
  },
  pick: { en: "Choose a camera", hi: "कैमरा चुनें" },
  same: {
    en: "Choose two different cameras.",
    hi: "दो अलग-अलग कैमरे चुनें।",
  },
  noCameras: {
    en: "Fewer than two cameras found. Plug both in (on different USB ports, or a powered hub), allow camera access, then reload.",
    hi: "दो से कम कैमरे मिले। दोनों लगाएँ (अलग USB पोर्ट या पावर वाले हब में), कैमरा की अनुमति दें, फिर पेज दोबारा खोलें।",
  },
  blocked: {
    en: "The browser couldn't open the cameras: {reason}",
    hi: "ब्राउज़र कैमरे नहीं खोल सका: {reason}",
  },
  capture: { en: "Take both photos", hi: "दोनों फ़ोटो लें" },
  sending: { en: "Sending both photos…", hi: "दोनों फ़ोटो भेजे जा रहे हैं…" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  lastPhoto: {
    en: "These are the last photos of the sample",
    hi: "ये नमूने की आख़िरी फ़ोटो हैं",
  },
  needsServer: {
    en: "Two-camera photos are sent straight away: the station's server must be reachable.",
    hi: "दो-कैमरा फ़ोटो तुरंत भेजी जाती हैं: स्टेशन का सर्वर उपलब्ध होना चाहिए।",
  },
});
