import { useEffect, useRef, useState } from "react";
import { ChevronDown, CheckIcon } from "@/components/icons";
import "./Listbox.css";

export interface ListboxOption<T extends string> {
  value: T;
  label: string;
  /** Secondary line under the label, e.g. a resolution or "Primary monitor". */
  description?: string;
  disabled?: boolean;
}

interface ListboxProps<T extends string> {
  options: readonly ListboxOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Shown in the trigger when `value` doesn't match any option. */
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * A custom single-select dropdown for options that need more than plain
 * text - a name plus a secondary line (a resolution, a role like "Primary
 * monitor"), proper hover/selected/disabled states, and a panel that's
 * actually styleable, none of which a native `<select>`/`<option>` allows.
 * Same open/close mechanics as `Menu`: click-outside and Escape close it.
 */
export function Listbox<T extends string>({ options, value, onChange, placeholder, ...rest }: ListboxProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  return (
    <div className="listbox" ref={rootRef}>
      <button
        type="button"
        className={["input", "listbox__trigger", open ? "is-open" : ""].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={rest["aria-label"]}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="listbox__trigger-label">{selected ? selected.label : (placeholder ?? "Select…")}</span>
        <ChevronDown className="listbox__chevron" size={15} />
      </button>
      {open && (
        <div className="listbox__panel" role="listbox" aria-label={rest["aria-label"]}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              disabled={opt.disabled}
              className={["listbox__option", opt.value === value ? "is-selected" : ""].filter(Boolean).join(" ")}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="listbox__option-row">
                <span className="listbox__option-label">{opt.label}</span>
                {opt.value === value && <CheckIcon className="listbox__option-check" size={14} />}
              </span>
              {opt.description && <span className="listbox__option-description">{opt.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
