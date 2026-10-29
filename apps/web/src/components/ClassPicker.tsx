import { CLASS_LABELS, KERNEL_CLASSES, type KernelClass } from "@ai-grain/core";

/** One button per class; the current choice is highlighted. */
export function ClassPicker({
  value,
  suggested,
  disabled,
  onPick,
}: {
  value: KernelClass | null;
  suggested?: KernelClass | null;
  disabled?: boolean;
  onPick: (cls: KernelClass) => void;
}) {
  return (
    <div className="class-picker" role="group" aria-label="Class">
      {KERNEL_CLASSES.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          className={[
            "chip",
            c === "sound"
              ? "chip-good"
              : c === "unclear"
                ? "chip-warn"
                : "chip-bad",
            value === c ? "selected" : "",
            suggested === c && value !== c ? "suggested" : "",
          ].join(" ")}
          onClick={() => onPick(c)}
        >
          {CLASS_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
