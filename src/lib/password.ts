/** Client-side password strength heuristic for the Account Setup page - a
 * real signal from length + character variety, not decorative. The backend
 * enforces the actual minimum (6 chars) independently; this only guides the
 * user before they submit. */

export type PasswordStrength = "empty" | "tooShort" | "weak" | "fair" | "good" | "strong";

export const MIN_PASSWORD_LENGTH = 6;

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) return "empty";
  if (pw.length < MIN_PASSWORD_LENGTH) return "tooShort";

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 1) return "weak";
  if (score === 2) return "fair";
  if (score === 3) return "good";
  return "strong";
}

export const PASSWORD_STRENGTH_META: Record<PasswordStrength, { label: string; tone: "bad" | "warn" | "good"; fill: number }> = {
  empty: { label: "", tone: "bad", fill: 0 },
  tooShort: { label: "Too short", tone: "bad", fill: 0.15 },
  weak: { label: "Weak", tone: "bad", fill: 0.35 },
  fair: { label: "Fair", tone: "warn", fill: 0.55 },
  good: { label: "Good", tone: "warn", fill: 0.78 },
  strong: { label: "Strong", tone: "good", fill: 1 },
};
