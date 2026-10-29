import { useCrops } from "../api/crops";

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
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {!crops.data?.some((c) => c.key === value) && (
        <option value={value}>{value}</option>
      )}
      {crops.data?.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
