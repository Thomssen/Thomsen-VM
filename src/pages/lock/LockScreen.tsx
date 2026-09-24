import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { useLock } from "@/state/LockProvider";
import { useSettings } from "@/state/SettingsProvider";
import { lockStatus } from "@/services/security";
import "./LockScreen.css";

/** Shown in place of the whole app body (still under the normal `TitleBar`)
 * while `LockProvider`'s `locked` is true. Deliberately minimal - no
 * recovery text, no skip, no bypass of any kind; see Settings -> Profile &
 * Security for the only way out (unlock, or Windows Credential Manager if
 * the password is truly forgotten). */
export function LockScreen() {
  const { unlock } = useLock();
  const { settings } = useSettings();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A cooldown from before a relaunch is still active - show it immediately
  // rather than only after a wasted submit.
  useEffect(() => {
    void lockStatus()
      .then((secs) => {
        if (secs != null) setCountdown(secs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (countdown == null || countdown <= 0) return;
    const id = window.setInterval(() => setCountdown((c) => (c != null && c > 1 ? c - 1 : null)), 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const cooling = countdown != null && countdown > 0;

  const submit = async () => {
    if (!password.trim() || busy || cooling) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unlock(password);
      if (!result.ok) {
        setError(result.message);
        setPassword("");
        if (result.retryAfterSecs != null) setCountdown(result.retryAfterSecs);
        inputRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <div className="lock__panel">
        <span className="lock__logo" aria-hidden="true">
          VM
        </span>
        <h1 className="lock__title">Welcome back{settings.username ? `, ${settings.username}` : ""}</h1>
        <p className="lock__lead">Enter your password to continue</p>

        <div className="lock__field">
          <TextInput
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="Password"
            autoFocus
            disabled={busy}
          />
          {(error || cooling) && <p className="lock__error">{cooling ? `Try again in ${countdown}s.` : error}</p>}
        </div>

        <Button variant="primary" fullWidth onClick={() => void submit()} loading={busy} disabled={!password.trim() || cooling}>
          Unlock
        </Button>
      </div>
    </div>
  );
}
