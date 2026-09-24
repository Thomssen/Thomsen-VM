import "./SegmentedControl.css";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", disabled, ...rest }: SegmentedControlProps<T>) {
  return (
    <div className={["segmented", `segmented--${size}`, disabled ? "is-disabled" : ""].filter(Boolean).join(" ")} role="tablist" aria-label={rest["aria-label"]}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          disabled={disabled}
          className={["segmented__item", opt.value === value ? "is-active" : ""].filter(Boolean).join(" ")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
