import { CROP_PRESETS } from "@ai-grain/core";
import { useCrops } from "../api/crops";
import { useGrainLabels } from "../i18n/common";

/** A select of the organisation's crops, by key. */
export function CropSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const crops = useCrops();
  const { cropLabel } = useGrainLabels();
  // Offline with nothing loaded: the ready-made crops, so a sample can still be started.
  const list =
    crops.data ?? (crops.isError ? Object.values(CROP_PRESETS) : undefined);
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {!list?.some((c) => c.key === value) && (
        <option value={value}>{value}</option>
      )}
      {list?.map((c) => (
        <option key={c.key} value={c.key}>
          {cropLabel(c.label)}
        </option>
      ))}
    </select>
  );
}
