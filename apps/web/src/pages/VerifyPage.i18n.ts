import { defineMessages } from "../i18n";

export const m = defineMessages({
  codeLabel: { en: "Certificate code", hi: "प्रमाणपत्र कोड" },
  check: { en: "Check", hi: "जाँचें" },
  title: { en: "Verify a grain report", hi: "अनाज रिपोर्ट सत्यापित करें" },
  intro: {
    en: "Enter the code printed beside the QR code on the report, or scan the QR code. This page shows the figures the report was issued with, so you can check that a printout or PDF hasn't been changed.",
    hi: "रिपोर्ट पर QR कोड के पास छपा कोड डालें, या QR कोड स्कैन करें। यह पेज वही आँकड़े दिखाता है जिनके साथ रिपोर्ट जारी हुई थी, ताकि आप जाँच सकें कि प्रिंट या PDF में कुछ बदला तो नहीं गया।",
  },
  checking: { en: "Checking…", hi: "जाँच हो रही है…" },
  notFound: { en: "Not found", hi: "नहीं मिला" },
  notFoundText: {
    en: "No report was issued with the code {code}. Check the code and try again.",
    hi: "कोड {code} से कोई रिपोर्ट जारी नहीं हुई। कोड जाँचकर फिर कोशिश करें।",
  },
  altered: { en: "Record altered", hi: "रिकॉर्ड बदला गया" },
  valid: { en: "Valid", hi: "मान्य" },
  withdrawn: { en: "Withdrawn", hi: "वापस लिया गया" },
  version: { en: "version {version}", hi: "संस्करण {version}" },
  issuedBy: {
    en: "This report was issued by {organisation} and has not been withdrawn.",
    hi: "यह रिपोर्ट {organisation} ने जारी की है और वापस नहीं ली गई है।",
  },
  alteredText: {
    en: "The stored record no longer matches the fingerprint it was issued with. Do not rely on this report; contact {organisation}.",
    hi: "सहेजा गया रिकॉर्ड अब उस फ़िंगरप्रिंट से मेल नहीं खाता जिसके साथ वह जारी हुआ था। इस रिपोर्ट पर भरोसा न करें; {organisation} से संपर्क करें।",
  },
  withdrawnOn: { en: "Withdrawn {date}", hi: "{date} को वापस लिया गया" },
  newerVersion: {
    en: "A newer version exists: {link}.",
    hi: "नया संस्करण उपलब्ध है: {link}।",
  },
  newerLink: {
    en: "{code} (version {version})",
    hi: "{code} (संस्करण {version})",
  },
  issued: { en: "Issued", hi: "जारी" },
  sample: { en: "Sample", hi: "नमूना" },
  standard: { en: "Standard", hi: "मानक" },
  none: { en: "none", hi: "कोई नहीं" },
  grade: { en: "Grade", hi: "ग्रेड" },
  belowAll: { en: "below all grades", hi: "सभी ग्रेड से नीचे" },
  purity: { en: "Purity", hi: "शुद्धता" },
  method: { en: "Method", hi: "विधि" },
  estimated: {
    en: "Estimated from photos (not weighed)",
    hi: "फ़ोटो से अनुमानित (तौला नहीं गया)",
  },
  weighed: { en: "Weighed", hi: "तौला गया" },
  methodDetail: {
    en: "{source}; kernels flagged by {model}, {reviewed} of {flagged} flagged kernels checked by {operators}",
    hi: "{source}; दाने {model} ने चिह्नित किए, {flagged} चिह्नित दानों में से {reviewed} की जाँच {operators} ने की",
  },
  sampleMass: { en: "Sample mass", hi: "नमूने का वज़न" },
  moisture: { en: "Moisture", hi: "नमी" },
  fingerprint: { en: "Fingerprint", hi: "फ़िंगरप्रिंट" },
  composition: { en: "Composition (mass %)", hi: "संरचना (द्रव्यमान %)" },
  totalDefects: { en: "Total defects", hi: "कुल दोष" },
  everyClass: { en: "Every class", hi: "सभी वर्ग" },
  disclaimer: {
    en: "A screening and pre-check result, not an official trade grade unless the issuer's method has been validated and approved.",
    hi: "यह जाँच और पूर्व-परीक्षण का परिणाम है; जारीकर्ता की विधि सत्यापित और स्वीकृत न हो तो यह आधिकारिक व्यापार ग्रेड नहीं है।",
  },
});
