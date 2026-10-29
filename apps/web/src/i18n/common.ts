import {
  classLabel as englishClassLabel,
  GROUP_LABELS,
  type ClassDef,
  type ClassGroup,
} from "@ai-grain/core";
import { useCallback, useMemo } from "react";
import { defineMessages, useLang, useT, type Lang } from "./index";

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

const GROUPS: Record<ClassGroup | "sound", Record<Lang, string>> = {
  sound: { en: "Sound grain", hi: "स्वस्थ दाने" },
  admixture: { en: GROUP_LABELS.admixture, hi: "अन्य अनाज की मिलावट" },
  broken_defective: {
    en: GROUP_LABELS.broken_defective,
    hi: "टूटे व दोषपूर्ण दाने",
  },
  impurity: { en: GROUP_LABELS.impurity, hi: "अशुद्धियाँ व बाहरी पदार्थ" },
  harmful: { en: GROUP_LABELS.harmful, hi: "हानिकारक व रोगग्रस्त" },
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
};

/** Translates a crop or class label if it is an unchanged preset label. */
export function presetLabel(label: string, lang: Lang): string {
  return lang === "hi" ? (PRESET_LABELS_HI[label] ?? label) : label;
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
      groupLabel: (g: ClassGroup | "sound") => GROUPS[g][lang],
      classLabel,
      cropLabel: (label: string) => presetLabel(label, lang),
    }),
    [lang, classLabel],
  );
}
