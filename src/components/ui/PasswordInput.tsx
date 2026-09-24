import { useState, type KeyboardEvent } from "react";
import { Field, TextInput } from "./Field";
import { PASSWORD_STRENGTH_META, passwordStrength } from "@/lib/password";
import "./PasswordInput.css";

interface PasswordInputProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}

/** A password field with a Show/Hide toggle - used everywhere a password is
 * entered (setup, Settings) except the lock screen, which uses a bare field. */
export function PasswordInput({ label, hint, value, onChange, placeholder, onKeyDown, autoFocus, disabled, id }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      hint={hint}
      htmlFor={id}
      aside={
        <button type="button" className="password-input__toggle" onClick={() => setVisible((v) => !v)} disabled={disabled}>
          {visible ? "Hide" : "Show"}
        </button>
      }
    >
      <TextInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        disabled={disabled}
      />
    </Field>
  );
}

/** Real signal from length + character variety - see `lib/password.ts`. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  const meta = PASSWORD_STRENGTH_META[strength];
  if (strength === "empty") return null;

  return (
    <div className="password-strength">
      <div className="password-strength__row">
        <span className="password-strength__label">Password strength</span>
        <span className={`password-strength__value password-strength__value--${meta.tone}`}>{meta.label}</span>
      </div>
      <div className="password-strength__bar">
        <div className={`password-strength__fill password-strength__fill--${meta.tone}`} style={{ width: `${meta.fill * 100}%` }} />
      </div>
    </div>
  );
}
