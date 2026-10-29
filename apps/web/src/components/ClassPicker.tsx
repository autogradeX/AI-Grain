import { CLASS_GROUPS, SOUND, UNCLEAR, type ClassDef } from "@ai-grain/core";
import { useT } from "../i18n";
import { common, useGrainLabels } from "../i18n/common";
import { m } from "./ClassPicker.i18n";

/** Buttons for every class of the crop, grouped like the report; the current choice is highlighted. */
export function ClassPicker({
  classes,
  value,
  suggested,
  disabled,
  onPick,
}: {
  classes: readonly ClassDef[];
  value: string | null;
  suggested?: string | null;
  disabled?: boolean;
  onPick: (cls: string) => void;
}) {
  const t = useT(m);
  const tc = useT(common);
  const { groupLabel, classLabel } = useGrainLabels();
  const chip = (id: string, label: string, tone: "good" | "warn" | "bad") => (
    <button
      key={id}
      type="button"
      disabled={disabled}
      className={[
        "chip",
        `chip-${tone}`,
        value === id ? "selected" : "",
        suggested === id && value !== id ? "suggested" : "",
      ].join(" ")}
      onClick={() => onPick(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="class-picker" role="group" aria-label={t("classGroup")}>
      <div className="class-picker-row">
        {chip(SOUND, tc("sound"), "good")}
        {chip(UNCLEAR, tc("unclear"), "warn")}
      </div>
      {CLASS_GROUPS.map((g) => {
        const inGroup = classes.filter((c) => c.group === g);
        if (!inGroup.length) return null;
        return (
          <div key={g} className="class-picker-group">
            <span className="class-picker-label">{groupLabel(g)}</span>
            <div className="class-picker-row">
              {inGroup.map((c) => chip(c.id, classLabel(classes, c.id), "bad"))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
