import type { AssayingResult } from "./service.js";

/*
 * The farmer's message: the result of their lot in a few lines, in their
 * language, sent by SMS or WhatsApp through the organisation's messaging
 * gateway. Only for samples where the farmer agreed (samples.farmerConsent).
 * The message has the lot, the commodity, the grade and the main figures,
 * and the link to the certificate; nothing about other farmers or the
 * station's settings.
 */

export const FARMER_SCHEMA = "ai-grain/farmer-message@1";

interface Words {
  title: string;
  lot: string;
  grade: string;
  noGrade: string;
  moisture: string;
  defects: string;
  purity: string;
  estimate: string;
  verify: string;
  price: string;
  rejected: string;
}

/** English is used for any language without its own words yet. */
export const FARMER_WORDS: Record<string, Words> = {
  en: {
    title: "Grain test result",
    lot: "Lot",
    grade: "Grade",
    noGrade: "No grade",
    moisture: "Moisture",
    defects: "Defects",
    purity: "Purity",
    estimate: "from photo",
    verify: "Check",
    price: "Price",
    rejected: "Not accepted at this grade",
  },
  hi: {
    title: "अनाज जाँच परिणाम",
    lot: "लॉट",
    grade: "ग्रेड",
    noGrade: "कोई ग्रेड नहीं",
    moisture: "नमी",
    defects: "दोष",
    purity: "शुद्धता",
    estimate: "फ़ोटो से अनुमान",
    verify: "जाँचें",
    price: "भाव",
    rejected: "इस ग्रेड पर स्वीकार नहीं",
  },
  // Regional languages: to be checked by native speakers at each station.
  mr: {
    title: "धान्य चाचणी निकाल",
    lot: "लॉट",
    grade: "ग्रेड",
    noGrade: "कोणताही ग्रेड नाही",
    moisture: "ओलावा",
    defects: "दोष",
    purity: "शुद्धता",
    estimate: "फोटोवरून अंदाज",
    verify: "तपासा",
    price: "भाव",
    rejected: "या ग्रेडवर स्वीकारले नाही",
  },
  gu: {
    title: "અનાજ ચકાસણી પરિણામ",
    lot: "લોટ",
    grade: "ગ્રેડ",
    noGrade: "કોઈ ગ્રેડ નથી",
    moisture: "ભેજ",
    defects: "ખામી",
    purity: "શુદ્ધતા",
    estimate: "ફોટો પરથી અંદાજ",
    verify: "તપાસો",
    price: "ભાવ",
    rejected: "આ ગ્રેડ પર સ્વીકાર્યું નથી",
  },
  pa: {
    title: "ਅਨਾਜ ਜਾਂਚ ਨਤੀਜਾ",
    lot: "ਲਾਟ",
    grade: "ਗ੍ਰੇਡ",
    noGrade: "ਕੋਈ ਗ੍ਰੇਡ ਨਹੀਂ",
    moisture: "ਨਮੀ",
    defects: "ਨੁਕਸ",
    purity: "ਸ਼ੁੱਧਤਾ",
    estimate: "ਫ਼ੋਟੋ ਤੋਂ ਅੰਦਾਜ਼ਾ",
    verify: "ਜਾਂਚੋ",
    price: "ਭਾਅ",
    rejected: "ਇਸ ਗ੍ਰੇਡ 'ਤੇ ਮਨਜ਼ੂਰ ਨਹੀਂ",
  },
  te: {
    title: "ధాన్యం పరీక్ష ఫలితం",
    lot: "లాట్",
    grade: "గ్రేడ్",
    noGrade: "గ్రేడ్ లేదు",
    moisture: "తేమ",
    defects: "లోపాలు",
    purity: "స్వచ్ఛత",
    estimate: "ఫోటో అంచనా",
    verify: "తనిఖీ",
    price: "ధర",
    rejected: "ఈ గ్రేడ్‌లో అంగీకరించలేదు",
  },
  or: {
    title: "ଶସ୍ୟ ପରୀକ୍ଷା ଫଳାଫଳ",
    lot: "ଲଟ୍",
    grade: "ଗ୍ରେଡ୍",
    noGrade: "କୌଣସି ଗ୍ରେଡ୍ ନାହିଁ",
    moisture: "ଆର୍ଦ୍ରତା",
    defects: "ତ୍ରୁଟି",
    purity: "ଶୁଦ୍ଧତା",
    estimate: "ଫଟୋରୁ ଆକଳନ",
    verify: "ଯାଞ୍ଚ",
    price: "ଦର",
    rejected: "ଏହି ଗ୍ରେଡ୍‌ରେ ଗ୍ରହଣ ହୋଇନାହିଁ",
  },
};

/** A price as people read it: ₹2,150 for rupees, else the code. */
export function money(value: number, currency: string): string {
  const n = value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${n}` : `${n} ${currency}`;
}

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

/** The text the farmer receives (short enough for two SMS parts). */
export function farmerText(result: AssayingResult, language?: string): string {
  const w = FARMER_WORDS[language ?? "en"] ?? FARMER_WORDS.en!;
  const moisture = result.parameters.find((p) => p.code === "moisture");
  const lot = result.enam.lotId ?? result.lot ?? `#${result.sampleNumber}`;
  const lines = [
    `${result.organisation ?? "AI-Grain"}: ${w.title}`,
    `${w.lot} ${lot}, ${result.commodity.name}`,
    result.grade
      ? `${w.grade}: ${result.grade}${result.standard ? ` (${result.standard})` : ""}`
      : w.noGrade,
    [
      moisture?.value != null && `${w.moisture} ${pct(moisture.value)}`,
      result.totalDefectsPct != null &&
        `${w.defects} ${pct(result.totalDefectsPct)}`,
      result.purityPct != null && `${w.purity} ${pct(result.purityPct)}`,
    ]
      .filter(Boolean)
      .join(", ") +
      (result.resultSource === "estimate" ? ` (${w.estimate})` : ""),
    ...(result.price
      ? [
          result.price.price !== null
            ? `${w.price}: ${money(result.price.price, result.price.currency)}/${result.price.unit}`
            : `${w.price}: ${w.rejected}`,
        ]
      : []),
    ...(result.certificate
      ? [`${w.verify}: ${result.certificate.verifyUrl}`]
      : []),
  ];
  return lines.filter((l) => l.trim()).join("\n");
}

/** Digits only, with India's +91 when a 10-digit number is given. */
export function normaliseMobile(mobile: string): string {
  const digits = mobile.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  return digits;
}

/** What the messaging gateway receives for one farmer. */
export function farmerMessage(
  result: AssayingResult,
  options: { channel: "sms" | "whatsapp"; language?: string },
) {
  return {
    schema: FARMER_SCHEMA,
    channel: options.channel,
    to: normaliseMobile(result.enam.farmer.mobile ?? ""),
    language: options.language ?? "en",
    text: farmerText(result, options.language),
    sampleId: result.sampleId,
    lotId: result.enam.lotId,
    certificateUrl: result.certificate?.verifyUrl ?? null,
  };
}
