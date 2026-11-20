import {
  classLabel as englishClassLabel,
  GROUP_LABELS,
  type ClassDef,
  type ClassGroup,
} from "@ai-grain/core";
import { useCallback, useMemo } from "react";
import {
  defineMessages,
  inLang,
  useLang,
  useT,
  type Lang,
  type Message,
  type RegionalLang,
} from "./index";

/** Words used across the app. Module-specific strings live next to each module. */
export const common = defineMessages({
  loading: { en: "Loading…", hi: "लोड हो रहा है…" },
  save: { en: "Save", hi: "सहेजें" },
  saving: { en: "Saving…", hi: "सहेजा जा रहा है…" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  delete: { en: "Delete", hi: "हटाएँ" },
  edit: { en: "Edit", hi: "बदलें" },
  close: { en: "Close", hi: "बंद करें" },
  back: { en: "Back", hi: "वापस" },
  yes: { en: "Yes", hi: "हाँ" },
  no: { en: "No", hi: "नहीं" },
  none: { en: "None", hi: "कोई नहीं" },
  optional: { en: "Optional", hi: "वैकल्पिक" },
  notClassified: { en: "not classified", hi: "वर्गीकृत नहीं" },
  sound: { en: "Sound", hi: "स्वस्थ" },
  unclear: { en: "Unclear", hi: "अस्पष्ट" },
  defect: { en: "Defect", hi: "दोष" },
  roleAdmin: { en: "Admin", hi: "व्यवस्थापक" },
  roleGrader: { en: "Grader", hi: "ग्रेडर" },
  roleViewer: { en: "Viewer", hi: "दर्शक" },
});

const GROUPS: Record<ClassGroup | "sound", Message> = {
  sound: {
    en: "Sound grain",
    hi: "स्वस्थ दाने",
    mr: "चांगले दाणे",
    gu: "સારા દાણા",
    pa: "ਚੰਗੇ ਦਾਣੇ",
    te: "మంచి గింజలు",
    or: "ଭଲ ଦାନା",
  },
  admixture: {
    en: GROUP_LABELS.admixture,
    hi: "अन्य अनाज की मिलावट",
    mr: "इतर धान्यांची भेसळ",
    gu: "અન્ય અનાજની ભેળસેળ",
    pa: "ਹੋਰ ਅਨਾਜ ਦੀ ਮਿਲਾਵਟ",
    te: "ఇతర ధాన్యాల కల్తీ",
    or: "ଅନ୍ୟ ଶସ୍ୟ ମିଶ୍ରଣ",
  },
  broken_defective: {
    en: GROUP_LABELS.broken_defective,
    hi: "टूटे व दोषपूर्ण दाने",
    mr: "तुटलेले व दोषयुक्त दाणे",
    gu: "તૂટેલા અને ખામીવાળા દાણા",
    pa: "ਟੁੱਟੇ ਅਤੇ ਖ਼ਰਾਬ ਦਾਣੇ",
    te: "విరిగిన, లోపమున్న గింజలు",
    or: "ଭଙ୍ଗା ଓ ତ୍ରୁଟିଥିବା ଦାନା",
  },
  impurity: {
    en: GROUP_LABELS.impurity,
    hi: "अशुद्धियाँ व बाहरी पदार्थ",
    mr: "अशुद्धी व बाह्य पदार्थ",
    gu: "અશુદ્ધિઓ અને બાહ્ય પદાર્થ",
    pa: "ਅਸ਼ੁੱਧੀਆਂ ਅਤੇ ਬਾਹਰੀ ਪਦਾਰਥ",
    te: "మలినాలు, బయటి పదార్థాలు",
    or: "ଅଶୁଦ୍ଧତା ଓ ବାହ୍ୟ ପଦାର୍ଥ",
  },
  harmful: {
    en: GROUP_LABELS.harmful,
    hi: "हानिकारक व रोगग्रस्त",
    mr: "हानिकारक व रोगग्रस्त",
    gu: "હાનિકારક અને રોગગ્રસ્ત",
    pa: "ਨੁਕਸਾਨਦੇਹ ਅਤੇ ਰੋਗੀ",
    te: "హానికరమైన, వ్యాధి సోకిన",
    or: "କ୍ଷତିକାରକ ଓ ରୋଗଗ୍ରସ୍ତ",
  },
};

/*
 * The regional languages have the crops and the classes an operator sees
 * most; other preset labels show in English. (Translations to be checked
 * by native speakers at each station.)
 */
const PRESET_LABELS_REGIONAL: Record<RegionalLang, Record<string, string>> = {
  mr: {
    Wheat: "गहू",
    Barley: "जव",
    Oats: "ओट्स",
    Rapeseed: "रेपसीड",
    "Hemp seeds": "भांगेचे बी",
    Paddy: "भात (धान)",
    Rice: "तांदूळ",
    Maize: "मका",
    "Chana (gram)": "हरभरा",
    "Tur (arhar)": "तूर",
    Moong: "मूग",
    Soybean: "सोयाबीन",
    Mustard: "मोहरी",
    Sound: "चांगले",
    Unclear: "अस्पष्ट",
    Broken: "तुटलेले",
    Brokens: "तुटलेले दाणे",
    "Suspected artificial / fake grain": "बनावट दाणा असल्याचा संशय",
  },
  gu: {
    Wheat: "ઘઉં",
    Barley: "જવ",
    Oats: "ઓટ્સ",
    Rapeseed: "રાયડો",
    "Hemp seeds": "ભાંગના બીજ",
    Paddy: "ડાંગર",
    Rice: "ચોખા",
    Maize: "મકાઈ",
    "Chana (gram)": "ચણા",
    "Tur (arhar)": "તુવેર",
    Moong: "મગ",
    Soybean: "સોયાબીન",
    Mustard: "રાઈ",
    Sound: "સારા",
    Unclear: "અસ્પષ્ટ",
    Broken: "તૂટેલા",
    Brokens: "તૂટેલા દાણા",
    "Suspected artificial / fake grain": "નકલી દાણાની શંકા",
  },
  pa: {
    Wheat: "ਕਣਕ",
    Barley: "ਜੌਂ",
    Oats: "ਜਵੀ",
    Rapeseed: "ਤੋਰੀਆ",
    "Hemp seeds": "ਭੰਗ ਦੇ ਬੀਜ",
    Paddy: "ਝੋਨਾ",
    Rice: "ਚੌਲ",
    Maize: "ਮੱਕੀ",
    "Chana (gram)": "ਛੋਲੇ",
    "Tur (arhar)": "ਅਰਹਰ",
    Moong: "ਮੂੰਗੀ",
    Soybean: "ਸੋਇਆਬੀਨ",
    Mustard: "ਸਰ੍ਹੋਂ",
    Sound: "ਚੰਗੇ",
    Unclear: "ਅਸਪਸ਼ਟ",
    Broken: "ਟੁੱਟੇ",
    Brokens: "ਟੁੱਟੇ ਦਾਣੇ",
    "Suspected artificial / fake grain": "ਨਕਲੀ ਦਾਣੇ ਦਾ ਸ਼ੱਕ",
  },
  te: {
    Wheat: "గోధుమ",
    Barley: "బార్లీ",
    Oats: "ఓట్స్",
    Rapeseed: "రేప్‌సీడ్",
    "Hemp seeds": "జనుము గింజలు",
    Paddy: "వరి ధాన్యం",
    Rice: "బియ్యం",
    Maize: "మొక్కజొన్న",
    "Chana (gram)": "శనగలు",
    "Tur (arhar)": "కందులు",
    Moong: "పెసలు",
    Soybean: "సోయాబీన్",
    Mustard: "ఆవాలు",
    Sound: "మంచివి",
    Unclear: "అస్పష్టం",
    Broken: "విరిగినవి",
    Brokens: "విరిగిన గింజలు",
    "Suspected artificial / fake grain": "నకిలీ గింజ అనే అనుమానం",
  },
  or: {
    Wheat: "ଗହମ",
    Barley: "ବାର୍ଲି",
    Oats: "ଓଟ୍ସ",
    Rapeseed: "ରେପସିଡ୍",
    "Hemp seeds": "ଗଞ୍ଜେଇ ମଞ୍ଜି",
    Paddy: "ଧାନ",
    Rice: "ଚାଉଳ",
    Maize: "ମକା",
    "Chana (gram)": "ବୁଟ",
    "Tur (arhar)": "ହରଡ଼",
    Moong: "ମୁଗ",
    Soybean: "ସୋୟାବିନ",
    Mustard: "ସୋରିଷ",
    Sound: "ଭଲ",
    Unclear: "ଅସ୍ପଷ୍ଟ",
    Broken: "ଭଙ୍ଗା",
    Brokens: "ଭଙ୍ଗା ଦାନା",
    "Suspected artificial / fake grain": "ନକଲି ଦାନା ସନ୍ଦେହ",
  },
};

/*
 * Hindi for the English labels of the preset crops and classes. Labels are
 * data each organisation can edit, so only an unchanged preset label is
 * translated; anything typed by the organisation is shown as typed.
 */
const PRESET_LABELS_HI: Record<string, string> = {
  Wheat: "गेहूँ",
  Barley: "जौ",
  Oats: "जई",
  Rapeseed: "सरसों (रेपसीड)",
  "Hemp seeds": "भांग के बीज",
  Sound: "स्वस्थ",
  Unclear: "अस्पष्ट",
  "Other cereals": "अन्य अनाज",
  Broken: "टूटे हुए",
  Shrivelled: "सिकुड़े हुए",
  Sprouted: "अंकुरित",
  "Heat-damaged": "गर्मी से क्षतिग्रस्त",
  "Pest-damaged": "कीट से क्षतिग्रस्त",
  "Discoloured germ / black point": "बदरंग भ्रूण / काला सिरा",
  "Green / immature": "हरे / कच्चे",
  "Weed and foreign seeds": "खरपतवार व अन्य बीज",
  "Husks and chaff": "भूसी व छिलके",
  "Plant parts": "पौधों के भाग",
  Stones: "कंकड़-पत्थर",
  "Other foreign material": "अन्य बाहरी पदार्थ",
  Ergot: "अरगट",
  Sclerotia: "स्क्लेरोशिया",
  "Fusarium-damaged": "फ्यूज़ेरियम से क्षतिग्रस्त",
  "Mouldy / decayed": "फफूंदयुक्त / सड़े हुए",
  "Other crop seeds": "अन्य फसलों के बीज",
  "Broken / split": "टूटे / फटे",
  "Immature / shrivelled": "कच्चे / सिकुड़े",
  "Green seeds": "हरे बीज",
  "Heat-damaged / discoloured": "गर्मी से क्षतिग्रस्त / बदरंग",
  "Weed seeds": "खरपतवार के बीज",
  "Pods and husks": "फलियाँ व भूसी",
  Paddy: "धान",
  Rice: "चावल",
  Maize: "मक्का",
  "Chana (gram)": "चना",
  "Tur (arhar)": "अरहर (तुअर)",
  Moong: "मूँग",
  Soybean: "सोयाबीन",
  Mustard: "सरसों",
  "Foreign matter (organic)": "बाहरी पदार्थ (जैविक)",
  "Foreign matter (inorganic)": "बाहरी पदार्थ (अजैविक)",
  "Admixture of lower class": "निचली किस्म की मिलावट",
  "Damaged / discoloured / sprouted / weevilled":
    "क्षतिग्रस्त / बदरंग / अंकुरित / घुन लगे",
  "Immature / shrunken / shrivelled": "कच्चे / सिकुड़े / पिचके",
  "Paddy grains": "धान के दाने",
  Brokens: "टूटे दाने",
  "Chalky grains": "चॉकी (सफ़ेद धब्बे वाले) दाने",
  "Red grains": "लाल दाने",
  "Damaged / slightly damaged": "क्षतिग्रस्त / हल्के क्षतिग्रस्त",
  "Discoloured grains": "बदरंग दाने",
  "Other edible grains": "अन्य खाद्य अनाज",
  Damaged: "क्षतिग्रस्त",
  "Slightly damaged / touched": "हल्के क्षतिग्रस्त",
  "Slightly damaged / discoloured": "हल्के क्षतिग्रस्त / बदरंग",
  "Shrivelled / immature": "सिकुड़े / कच्चे",
  Weevilled: "घुन लगे",
  "Split / broken": "दो फाड़ / टूटे",
};

/** Translates a crop or class label if it is an unchanged preset label. */
export function presetLabel(label: string, lang: Lang): string {
  if (lang === "hi") return PRESET_LABELS_HI[label] ?? label;
  if (lang === "en") return label;
  return PRESET_LABELS_REGIONAL[lang][label] ?? label;
}

/**
 * Labels for grain data in the current language: class groups, class labels
 * (as configured, translated when they are unchanged presets) and crop names.
 */
export function useGrainLabels() {
  const { lang } = useLang();
  const t = useT(common);
  const classLabel = useCallback(
    (classes: readonly ClassDef[], id: string | null) => {
      if (!id) return t("notClassified");
      return presetLabel(englishClassLabel(classes, id), lang);
    },
    [lang, t],
  );
  return useMemo(
    () => ({
      groupLabel: (g: ClassGroup | "sound") => inLang(GROUPS[g], lang),
      classLabel,
      cropLabel: (label: string) => presetLabel(label, lang),
    }),
    [lang, classLabel],
  );
}
