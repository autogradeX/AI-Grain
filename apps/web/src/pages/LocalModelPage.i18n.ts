import { defineMessages } from "../i18n";

export const m = defineMessages({
  lastError: {
    en: "The last training didn't finish: {message}",
    hi: "पिछला प्रशिक्षण पूरा नहीं हुआ: {message}",
  },
  title: { en: "Local model", hi: "स्थानीय मॉडल" },
  intro: {
    en: "Your own model for each crop, trained on your kernels: checked by a person, or settled by Model Orchestration. It runs on this server with no internet, so photos are classified even when Model Orchestration can't be reached. Only its confident verdicts stand; harmful classes and anything it isn't sure about go to a person.",
    hi: "हर फ़सल के लिए आपका अपना मॉडल, आपके दानों पर प्रशिक्षित: व्यक्ति द्वारा जाँचे गए, या मॉडल ऑर्केस्ट्रेशन द्वारा तय। यह बिना इंटरनेट इसी सर्वर पर चलता है, इसलिए मॉडल ऑर्केस्ट्रेशन तक न पहुँचने पर भी फ़ोटो वर्गीकृत होती हैं। केवल इसके पक्के फ़ैसले माने जाते हैं; हानिकारक वर्ग और जिन पर यह निश्चित न हो, वे व्यक्ति के पास जाते हैं।",
  },
  crop: { en: "Crop", hi: "फ़सल" },
  useTitle: { en: "When it classifies", hi: "यह कब वर्गीकृत करता है" },
  modeOffline: {
    en: "When Model Orchestration can't be reached (recommended)",
    hi: "जब मॉडल ऑर्केस्ट्रेशन तक न पहुँचा जा सके (अनुशंसित)",
  },
  modeAlways: {
    en: "Always: never use Model Orchestration",
    hi: "हमेशा: मॉडल ऑर्केस्ट्रेशन का उपयोग कभी नहीं",
  },
  modeOff: {
    en: "Never: photos wait for internet",
    hi: "कभी नहीं: फ़ोटो इंटरनेट का इंतज़ार करती हैं",
  },
  dataTitle: { en: "What it learns from", hi: "यह किससे सीखता है" },
  dataHint: {
    en: "Each class needs at least {perClass} kernels to be learned, and the model at least {total} in all. Kernels checked by a person count fully; those Model Orchestration settled count half.",
    hi: "हर वर्ग को सीखने के लिए कम से कम {perClass} दाने चाहिए, और मॉडल को कुल कम से कम {total}। व्यक्ति द्वारा जाँचे दाने पूरे गिने जाते हैं; मॉडल ऑर्केस्ट्रेशन द्वारा तय आधे।",
  },
  class: { en: "Class", hi: "वर्ग" },
  reviewed: { en: "Checked by a person", hi: "व्यक्ति द्वारा जाँचे" },
  settled: { en: "Settled by AI", hi: "AI द्वारा तय" },
  ready: { en: "Ready", hi: "तैयार" },
  needMore: { en: "{count} more needed", hi: "{count} और चाहिए" },
  noData: {
    en: "No classified kernels of this crop yet.",
    hi: "इस फ़सल के अभी कोई वर्गीकृत दाने नहीं।",
  },
  train: { en: "Train a new version", hi: "नया संस्करण प्रशिक्षित करें" },
  training: {
    en: "Training… (a few seconds to a few minutes)",
    hi: "प्रशिक्षण हो रहा है… (कुछ सेकंड से कुछ मिनट)",
  },
  current: {
    en: "Current model: version {version}",
    hi: "वर्तमान मॉडल: संस्करण {version}",
  },
  noModel: {
    en: "No model for this crop yet: offline, its photos wait for internet.",
    hi: "इस फ़सल के लिए अभी कोई मॉडल नहीं: ऑफ़लाइन होने पर इसकी फ़ोटो इंटरनेट का इंतज़ार करती हैं।",
  },
  accuracy: { en: "Correct", hi: "सही" },
  accuracyNote: {
    en: "on {count} kernels from photos it didn't learn from",
    hi: "उन फ़ोटो के {count} दानों पर जिनसे इसने नहीं सीखा",
  },
  defectRecall: { en: "Defects caught", hi: "पकड़े गए दोष" },
  defectRecallNote: {
    en: "defective kernels it didn't call sound",
    hi: "दोषपूर्ण दाने जिन्हें इसने स्वस्थ नहीं कहा",
  },
  highAccuracy: { en: "Confident verdicts correct", hi: "पक्के फ़ैसले सही" },
  highAccuracyNote: {
    en: "{share}% of kernels get a confident verdict; the rest go to a person",
    hi: "{share}% दानों को पक्का फ़ैसला मिलता है; बाकी व्यक्ति के पास जाते हैं",
  },
  precision: { en: "When it says this, right", hi: "जब यह कहे, तब सही" },
  recall: { en: "Of these, found", hi: "इनमें से पहचाने" },
  examples: { en: "Kernels", hi: "दाने" },
  leftOut: {
    en: "Left out (too few examples yet): {list}. Kernels of these classes go to a person.",
    hi: "छोड़े गए (अभी बहुत कम उदाहरण): {list}। इन वर्गों के दाने व्यक्ति के पास जाते हैं।",
  },
  trainedOn: {
    en: "Trained on {count} kernels · {date}",
    hi: "{count} दानों पर प्रशिक्षित · {date}",
  },
  inUse: { en: "Used offline", hi: "ऑफ़लाइन उपयोग में" },
  inUseNote: {
    en: "It cleared the quality bar on photos it didn't learn from.",
    hi: "इसने उन फ़ोटो पर गुणवत्ता की शर्त पूरी की जिनसे इसने नहीं सीखा।",
  },
  notUsed: {
    en: "Not used yet: {list}. Offline, photos wait for internet. Check more samples (especially defects) and train again.",
    hi: "अभी उपयोग में नहीं: {list}। ऑफ़लाइन, फ़ोटो इंटरनेट का इंतज़ार करती हैं। और नमूने जाँचें (ख़ासकर दोष) और फिर से प्रशिक्षित करें।",
  },
  older: { en: "Earlier versions", hi: "पिछले संस्करण" },
  versionLine: {
    en: "Version {version} · {pct}% correct · {date}",
    hi: "संस्करण {version} · {pct}% सही · {date}",
  },
  retrainHint: {
    en: "Train again after more samples have been checked: each version learns from everything so far.",
    hi: "और नमूने जाँचे जाने के बाद फिर से प्रशिक्षित करें: हर संस्करण अब तक के सब कुछ से सीखता है।",
  },
});
