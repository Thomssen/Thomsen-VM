import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "@/components/icons";
import "./Field.css";

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Right-aligned adornment in the label row (e.g. a small action). */
  aside?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, aside, htmlFor, children, className }: FieldProps) {
  return (
    <div className={["field", error ? "field--error" : "", className ?? ""].filter(Boolean).join(" ")}>
      {(label || aside) && (
        <div className="field__labelrow">
          {label && (
            <label className="field__label" htmlFor={htmlFor}>
              {label}
            </label>
          )}
          {aside && <div className="field__aside">{aside}</div>}
        </div>
      )}
      {children}
      {error ? <p className="field__error">{error}</p> : hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ className, mono, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={["input", mono ? "input--mono" : "", className ?? ""].filter(Boolean).join(" ")}
      spellCheck={false}
      autoComplete="off"
      {...rest}
    />
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, mono, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={["input", "textarea", mono ? "input--mono" : "", className ?? ""].filter(Boolean).join(" ")}
      spellCheck={false}
      {...rest}
    />
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  return (
    <span className="select">
      <select ref={ref} className={["input", "select__el", className ?? ""].filter(Boolean).join(" ")} {...rest}>
        {children}
      </select>
      <ChevronDown className="select__chevron" size={15} />
    </span>
  );
});
