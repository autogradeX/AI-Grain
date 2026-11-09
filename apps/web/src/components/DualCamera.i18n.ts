import { defineMessages } from "../i18n";

export const m = defineMessages({
  topBlank: {
    en: "The top camera's picture is blank or blurred: check that it sees the grains on the glass and is in focus, and that nothing covers it.",
    hi: "ऊपर के कैमरे की तस्वीर खाली या धुँधली है: जाँचें कि वह कांच पर दाने देख रहा है, फ़ोकस में है, और कुछ उसे ढक नहीं रहा।",
  },
  bottomBlank: {
    en: "The bottom camera's picture is blank or blurred: check that it looks up at the glass and is in focus (not touching the glass), that no light panel sits between it and the glass, and that the grains are lit from above. If the two pictures are the wrong way round, press Swap top and bottom.",
    hi: 'नीचे के कैमरे की तस्वीर खाली या धुँधली है: जाँचें कि वह ऊपर कांच की ओर देख रहा है और फ़ोकस में है (कांच को छू नहीं रहा), उसके और कांच के बीच कोई लाइट पैनल नहीं है, और दानों पर ऊपर से रोशनी है। अगर दोनों तस्वीरें उलटी हैं, तो "ऊपर और नीचे बदलें" दबाएँ।',
  },
  finding: { en: "Looking for the cameras…", hi: "कैमरे ढूँढ रहे हैं…" },
  findingHint: {
    en: "Trying each camera on this computer to find the two that work together. This takes a few seconds.",
    hi: "इस कंप्यूटर के हर कैमरे को आज़मा रहे हैं ताकि साथ काम करने वाले दो कैमरे मिलें। इसमें कुछ सेकंड लगते हैं।",
  },
  findCameras: { en: "Find my cameras", hi: "मेरे कैमरे ढूँढें" },
  noPair: {
    en: "no two cameras on this computer give pictures at the same time",
    hi: "इस कंप्यूटर पर कोई भी दो कैमरे एक साथ तस्वीर नहीं देते",
  },
  topFailed: {
    en: "The top camera didn't start: {reason}.",
    hi: "ऊपर का कैमरा चालू नहीं हुआ: {reason}।",
  },
  bottomFailed: {
    en: "The bottom camera didn't start: {reason}.",
    hi: "नीचे का कैमरा चालू नहीं हुआ: {reason}।",
  },
  bothFailed: {
    en: "The cameras didn't start: {reason}.",
    hi: "कैमरे चालू नहीं हुए: {reason}।",
  },
  cameraN: { en: "camera {n}", hi: "कैमरा {n}" },
  liveAt: { en: "Live at {size}", hi: "{size} पर चालू" },
  starting: { en: "Starting…", hi: "चालू हो रहा है…" },
  notStarted: { en: "Not started", hi: "चालू नहीं हुआ" },
  swap: {
    en: "Swap top and bottom",
    hi: "ऊपर और नीचे बदलें",
  },
  retry: { en: "Try again", hi: "फिर से कोशिश करें" },
  bandwidth: {
    en: "Smaller sizes and every camera on this computer were tried. Plug one camera into a port on the other side of the computer (or a blue USB 3 port), or use a powered USB hub; close any other app using a camera; then press Try again.",
    hi: 'छोटे आकार और इस कंप्यूटर के सभी कैमरे आज़माए गए। एक कैमरा कंप्यूटर की दूसरी तरफ़ के पोर्ट (या नीले USB 3 पोर्ट) में लगाएँ, या पावर वाला USB हब इस्तेमाल करें; कैमरा इस्तेमाल कर रहे दूसरे ऐप बंद करें; फिर "फिर से कोशिश करें" दबाएँ।',
  },
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
