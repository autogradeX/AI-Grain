import {
  CLASS_GROUPS,
  GROUP_LABELS,
  SOUND,
  UNCLEAR,
  type ClassDef,
} from "@ai-grain/core";

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
    <div className="class-picker" role="group" aria-label="Class">
      <div className="class-picker-row">
        {chip(SOUND, "Sound", "good")}
        {chip(UNCLEAR, "Unclear", "warn")}
      </div>
      {CLASS_GROUPS.map((g) => {
        const inGroup = classes.filter((c) => c.group === g);
        if (!inGroup.length) return null;
        return (
          <div key={g} className="class-picker-group">
            <span className="class-picker-label">{GROUP_LABELS[g]}</span>
            <div className="class-picker-row">
              {inGroup.map((c) => chip(c.id, c.label, "bad"))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
