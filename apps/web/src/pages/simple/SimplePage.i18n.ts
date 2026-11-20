import { defineMessages } from "../../i18n";

export const m = defineMessages({
  needsWeighing: {
    en: "This grain's standard needs every part weighed on the scale, so the station can't finish by itself. Ask the admin to allow the photo result on the standard (Standards), or finish this sample in the full app.",
    hi: "इस अनाज के मानक में हर हिस्सा तराज़ू पर तौलना ज़रूरी है, इसलिए स्टेशन अपने-आप पूरा नहीं कर सकता। व्यवस्थापक से मानक पर फ़ोटो परिणाम की अनुमति देने को कहें (मानक), या यह नमूना पूरे ऐप में पूरा करें।",
  },
  notFinishing: {
    en: "The test isn't finishing by itself. Tap Help to send a report, or finish it in the full app.",
    hi: "जाँच अपने-आप पूरी नहीं हो रही। रिपोर्ट भेजने के लिए मदद दबाएँ, या पूरे ऐप में पूरा करें।",
  },
  title: { en: "Grain test", hi: "अनाज जाँच" },
  pickCrop: {
    en: "Which grain? Tap to start.",
    hi: "कौन सा अनाज? शुरू करने के लिए छुएँ।",
  },
  noCrops: {
    en: "Simple mode isn't set up yet. Ask your administrator to choose the crops in Settings → Simple mode.",
    hi: "सरल मोड अभी सेट नहीं है। अपने व्यवस्थापक से सेटिंग्स → सरल मोड में फ़सलें चुनने को कहें।",
  },
  help: { en: "Help", hi: "मदद" },
  fullApp: { en: "Full app", hi: "पूरा ऐप" },
  farmerTitle: { en: "Farmer's details", hi: "किसान का विवरण" },
  farmerHint: {
    en: "Optional. The result can be sent to the farmer's phone.",
    hi: "वैकल्पिक। परिणाम किसान के फ़ोन पर भेजा जा सकता है।",
  },
  start: { en: "Start test", hi: "जाँच शुरू करें" },
  back: { en: "Back", hi: "वापस" },
  stepStart: { en: "Getting ready…", hi: "तैयारी हो रही है…" },
  stepWeigh: { en: "Weighing the sample…", hi: "नमूना तौला जा रहा है…" },
  stepMoisture: {
    en: "Press the test key on the moisture meter",
    hi: "नमी मीटर पर टेस्ट कुंजी दबाएँ",
  },
  stepPhoto: {
    en: "Taking photos. Don't move the tray.",
    hi: "फ़ोटो ली जा रही हैं। ट्रे को न हिलाएँ।",
  },
  stepAnalyse: {
    en: "Counting and checking the grains…",
    hi: "दाने गिने और जाँचे जा रहे हैं…",
  },
  waitingInternet: {
    en: "No internet: this result will be ready when the connection is back. You can start the next test.",
    hi: "इंटरनेट नहीं: कनेक्शन लौटने पर यह परिणाम तैयार होगा। आप अगली जाँच शुरू कर सकते हैं।",
  },
  skipped: {
    en: "{what} skipped: {reason}",
    hi: "{what} छोड़ा गया: {reason}",
  },
  weight: { en: "Weight", hi: "वज़न" },
  moisture: { en: "Moisture", hi: "नमी" },
  reviewTitle: {
    en: "Please check this grain ({left} left)",
    hi: "कृपया यह दाना जाँचें ({left} बाकी)",
  },
  reviewTop: { en: "From above", hi: "ऊपर से" },
  reviewUnder: { en: "From below", hi: "नीचे से" },
  aiSays: { en: "The AI says: {class}", hi: "AI कहता है: {class}" },
  aiUnsure: { en: "The AI isn't sure.", hi: "AI निश्चित नहीं है।" },
  yes: { en: "Yes, {class}", hi: "हाँ, {class}" },
  sound: { en: "Good grain", hi: "अच्छा दाना" },
  notSure: { en: "Not sure", hi: "पक्का नहीं" },
  other: { en: "Something else", hi: "कुछ और" },
  restAi: {
    en: "The AI is right for the rest",
    hi: "बाकी के लिए AI सही है",
  },
  done: { en: "Result", hi: "परिणाम" },
  grade: { en: "Grade {grade}", hi: "ग्रेड {grade}" },
  noGrade: { en: "Below all grades", hi: "किसी ग्रेड में नहीं" },
  noStandard: { en: "No standard set", hi: "कोई मानक तय नहीं" },
  purity: { en: "Purity", hi: "शुद्धता" },
  defects: { en: "Defects", hi: "दोष" },
  grains: { en: "Grains", hi: "दाने" },
  print: { en: "Print slip", hi: "पर्ची छापें" },
  next: { en: "Next test", hi: "अगली जाँच" },
  problem: { en: "Something went wrong", hi: "कुछ गड़बड़ हुई" },
  tryAgain: { en: "Try again", hi: "फिर से कोशिश करें" },
  camerasMissing: {
    en: "The cameras aren't connected. Check both USB cables, then try again.",
    hi: "कैमरे जुड़े नहीं हैं। दोनों USB केबल जाँचें, फिर से कोशिश करें।",
  },
  camerasStart: {
    en: "The cameras didn't start. Unplug one camera and plug it into a port on the other side of the computer, then try again.",
    hi: "कैमरे चालू नहीं हुए। एक कैमरा निकालकर कंप्यूटर की दूसरी तरफ़ के पोर्ट में लगाएँ, फिर से कोशिश करें।",
  },
  topBlank: {
    en: "The top camera sees nothing clear. Check that it isn't covered and that the light is on.",
    hi: "ऊपर का कैमरा साफ़ कुछ नहीं देख रहा। जाँचें कि वह ढका नहीं है और रोशनी चालू है।",
  },
  bottomBlank: {
    en: "The bottom camera sees nothing clear. Clean the glass, check that the camera isn't touching it, and that the light is on.",
    hi: "नीचे का कैमरा साफ़ कुछ नहीं देख रहा। कांच साफ़ करें, जाँचें कि कैमरा उसे छू नहीं रहा, और रोशनी चालू है।",
  },
  photoFailed: {
    en: "The photo couldn't be used: {reason}",
    hi: "फ़ोटो का उपयोग नहीं हो सका: {reason}",
  },
  serverDown: {
    en: "The station isn't answering. Check that the station computer is on, then try again.",
    hi: "स्टेशन जवाब नहीं दे रहा। जाँचें कि स्टेशन कंप्यूटर चालू है, फिर से कोशिश करें।",
  },
  checksTitle: { en: "Station check", hi: "स्टेशन जाँच" },
  check_server: { en: "Station", hi: "स्टेशन" },
  check_cameras: { en: "Cameras", hi: "कैमरे" },
  check_balance: { en: "Balance", hi: "तराज़ू" },
  check_meter: { en: "Moisture meter", hi: "नमी मीटर" },
  check_internet: { en: "Internet", hi: "इंटरनेट" },
  check_ai: { en: "Grain checking", hi: "दाना जाँच" },
  fix_server: {
    en: "Turn on the station computer and wait a minute.",
    hi: "स्टेशन कंप्यूटर चालू करें और एक मिनट रुकें।",
  },
  fix_cameras: {
    en: "Plug in the camera cables.",
    hi: "कैमरा केबल लगाएँ।",
  },
  fix_balance: {
    en: "Plug in the balance cable. Tests still run without the weight.",
    hi: "तराज़ू का केबल लगाएँ। वज़न के बिना भी जाँच चलती है।",
  },
  fix_meter: {
    en: "Plug in the moisture meter cable. Tests still run without moisture.",
    hi: "नमी मीटर का केबल लगाएँ। नमी के बिना भी जाँच चलती है।",
  },
  fix_internet: {
    en: "No internet now: results are kept and sent later by themselves.",
    hi: "अभी इंटरनेट नहीं: परिणाम रखे जाते हैं और बाद में अपने-आप भेजे जाते हैं।",
  },
  fix_ai: {
    en: "Grain checking isn't set up on this station: call support.",
    hi: "इस स्टेशन पर दाना जाँच सेट नहीं है: सहायता को कॉल करें।",
  },
  allGood: { en: "Everything is ready", hi: "सब तैयार है" },
  sendHelp: {
    en: "Send a help report",
    hi: "मदद रिपोर्ट भेजें",
  },
  helpNote: {
    en: "What happened? (optional)",
    hi: "क्या हुआ? (वैकल्पिक)",
  },
  helpSent: {
    en: "Sent. Support can see what the station saw and will call you.",
    hi: "भेज दिया। सहायता टीम स्टेशन की स्थिति देख सकती है और आपको कॉल करेगी।",
  },
  close: { en: "Close", hi: "बंद करें" },
});
