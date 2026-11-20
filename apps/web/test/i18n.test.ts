import { describe, expect, it } from "vitest";
import { inLang, LANGS, locale } from "../src/i18n";
import { presetLabel } from "../src/i18n/common";
import { m as simple } from "../src/pages/simple/SimplePage.i18n";
import { m as lot } from "../src/components/LotFields.i18n";
import { m as price } from "../src/components/PriceBox.i18n";

const regional = ["mr", "gu", "pa", "te", "or"] as const;

describe("languages", () => {
  it("shows English where a regional string is missing", () => {
    expect(inLang({ en: "Save", hi: "सहेजें" }, "te")).toBe("Save");
    expect(inLang({ en: "Save", hi: "सहेजें", te: "సేవ్" }, "te")).toBe("సేవ్");
    expect(Object.keys(LANGS)).toEqual(["en", "hi", ...regional]);
    expect(locale("mr")).toBe("mr-IN-u-nu-latn");
  });

  it("has Simple mode, the farmer's fields and the price in every regional language, with the same placeholders", () => {
    for (const messages of [simple, lot, price]) {
      for (const [key, msg] of Object.entries(messages)) {
        const holes = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort();
        for (const l of regional) {
          expect(msg[l], `${key} in ${l}`).toBeTruthy();
          expect(holes(msg[l]!), `${key} in ${l}`).toEqual(holes(msg.en));
        }
      }
    }
  });

  it("names the crops in each language and keeps unknown labels as typed", () => {
    expect(presetLabel("Wheat", "pa")).toBe("ਕਣਕ");
    expect(presetLabel("Paddy", "or")).toBe("ଧାନ");
    expect(presetLabel("Chalky grains", "gu")).toBe("Chalky grains");
    expect(presetLabel("My own class", "mr")).toBe("My own class");
  });
});
