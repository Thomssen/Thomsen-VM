import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Field, TextInput } from "@/components/ui/Field";
import { PasswordInput, PasswordStrengthMeter } from "@/components/ui/PasswordInput";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { CheckIcon, XIcon } from "@/components/icons";
import { useSettings } from "@/state/SettingsProvider";
import { useLock } from "@/state/LockProvider";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, isTauri } from "@/services/ipc";
import { getHostFacts, getQemuStatus, getDefaultVmFolder } from "@/services/system";
import { getAutomaticHardware } from "@/services/vms";
import { closeWindow } from "@/services/window";
import { openDialog } from "@/services/os";
import { formatMb } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { APP } from "@/config/app";
import type { AutomaticHardware, HostFacts, ProviderAvailability, ThemeSetting, WindowStyle } from "@/types";
import "./OnboardingWizard.css";

const STEP_COUNT = 5;

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];
const THEME_LABELS: Record<ThemeSetting, string> = { dark: "Dark", light: "Light", system: "System" };

/** Renders itself in place of the sidebar/content while
 * `settings.onboardingCompleted` is false - see `App.tsx`. Finishing calls
 * `update({ onboardingCompleted: true, ... })`, which flips that flag and
 * lets `App.tsx`'s own reactive render switch back to the normal app. */
export function OnboardingWizard() {
  const { settings, update } = useSettings();
  const { hasPassword, createPassword } = useLock();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // -- Account Setup ------------------------------------------------------
  const [username, setUsername] = useState(settings.username);
  const [wantsPassword, setWantsPassword] = useState(true);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [justCreatedPassword, setJustCreatedPassword] = useState(false);

  // -- VM Setup -------------------------------------------------------------
  const [host, setHost] = useState<HostFacts | null>(null);
  const [qemu, setQemu] = useState<ProviderAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoHw, setAutoHw] = useState<AutomaticHardware | null>(null);
  const [hwInitialized, setHwInitialized] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [cpuDraft, setCpuDraft] = useState(settings.defaultCpuCores);
  const [ramGbDraft, setRamGbDraft] = useState(settings.defaultRamMb / 1024);
  const [diskDraft, setDiskDraft] = useState(settings.defaultDiskGb);

  useEffect(() => {
    void getDefaultVmFolder()
      .then(setFolderDraft)
      .catch(() => {});
  }, []);

  const runChecks = () => {
    setChecking(true);
    Promise.all([getHostFacts(), getQemuStatus()])
      .then(([h, q]) => {
        setHost(h);
        setQemu(q);
        setUsername((u) => (u.trim() ? u : h.username));
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the hardware fields from a real, host-aware recommendation exactly
  // once host facts are in - never overwrites what the user then types.
  useEffect(() => {
    if (!host || hwInitialized) return;
    setHwInitialized(true);
    void getAutomaticHardware(settings.defaultCpuCores, settings.defaultRamMb)
      .then((auto) => {
        setAutoHw(auto);
        setCpuDraft(auto.cpuCores);
        setRamGbDraft(Math.round((auto.ramMb / 1024) * 10) / 10);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const chooseFolder = async () => {
    const path = await openDialog({ title: "Choose a VM storage folder", directory: true });
    if (path) setFolderDraft(path);
  };
  const useDefaultFolder = () => void getDefaultVmFolder().then(setFolderDraft).catch(() => {});

  const canContinueAccount = () => {
    if (!username.trim()) return false;
    if (wantsPassword && !hasPassword) {
      if (passwordDraft.length < MIN_PASSWORD_LENGTH) return false;
      if (passwordDraft !== confirmDraft) return false;
    }
    return true;
  };

  const continueFromAccount = async () => {
    setAccountError(null);
    if (!username.trim()) {
      setAccountError("Enter a username to continue.");
      return;
    }
    if (wantsPassword && !hasPassword) {
      if (passwordDraft.length < MIN_PASSWORD_LENGTH) {
        setAccountError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (passwordDraft !== confirmDraft) {
        setAccountError("Passwords do not match.");
        return;
      }
      setAccountBusy(true);
      try {
        await createPassword(passwordDraft);
        setJustCreatedPassword(true);
        setStep(2);
      } catch (e) {
        setAccountError(errorMessage(e));
      } finally {
        setAccountBusy(false);
      }
      return;
    }
    setStep(2);
  };

  const vtLabel = host?.cpuName.toLowerCase().includes("intel") ? "Intel VT-x" : host?.cpuName.toLowerCase().includes("amd") ? "AMD-V" : "Hardware virtualization";
  const maxCpu = autoHw?.maxCpuCores ?? 16;
  const maxRamGb = autoHw ? autoHw.maxRamMb / 1024 : 16;
  const passwordProtected = hasPassword || justCreatedPassword;

  const finish = () =>
    (async () => {
      setFinishing(true);
      try {
        await update({
          username: username.trim(),
          defaultVmFolder: folderDraft || null,
          defaultCpuCores: cpuDraft,
          defaultRamMb: Math.round(ramGbDraft * 1024),
          defaultDiskGb: diskDraft,
          onboardingCompleted: true,
        });
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setFinishing(false);
      }
    })();

  return (
    <div className="onboarding">
      <div className="onboarding__panel">
        {step > 0 && (
          <div className="onboarding__progress">
            <span className="onboarding__step-label">
              Step {step + 1} of {STEP_COUNT}
            </span>
            <div className="onboarding__bar">
              <div className="onboarding__bar-fill" style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="onboarding__content" key={step}>
          {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}

          {step === 1 && (
            <AccountSetupStep
              username={username}
              onUsernameChange={setUsername}
              hasPassword={hasPassword}
              wantsPassword={wantsPassword}
              onWantsPasswordChange={setWantsPassword}
              password={passwordDraft}
              onPasswordChange={setPasswordDraft}
              confirmPassword={confirmDraft}
              onConfirmPasswordChange={setConfirmDraft}
              error={accountError}
            />
          )}

          {step === 2 && (
            <AppearanceStep
              theme={settings.theme}
              onThemeChange={(theme) => void update({ theme })}
              windowStyle={settings.windowStyle}
              onWindowStyleChange={(windowStyle) => void update({ windowStyle })}
            />
          )}

          {step === 3 && (
            <VmSetupStep
              host={host}
              qemu={qemu}
              checking={checking}
              onRecheck={runChecks}
              vtLabel={vtLabel}
              autoHw={autoHw}
              maxCpu={maxCpu}
              maxRamGb={maxRamGb}
              cpuCores={cpuDraft}
              onCpuChange={setCpuDraft}
              ramGb={ramGbDraft}
              onRamChange={setRamGbDraft}
              diskGb={diskDraft}
              onDiskChange={setDiskDraft}
              folderPath={folderDraft}
              onFolderChange={setFolderDraft}
              onChooseFolder={chooseFolder}
              onUseDefaultFolder={useDefaultFolder}
            />
          )}

          {step === 4 && (
            <FinishStep
              username={username}
              passwordProtected={passwordProtected}
              theme={settings.theme}
              cpuCores={cpuDraft}
              ramGb={ramGbDraft}
              diskGb={diskDraft}
              virtualizationEnabled={host?.virtualizationFirmwareEnabled ?? null}
            />
          )}
        </div>

        {step > 0 && (
          <div className="onboarding__nav">
            <Button variant="ghost" onClick={goBack} disabled={finishing || accountBusy}>
              Back
            </Button>
            <div className="onboarding__nav-right">
              {step === 1 && (
                <Button variant="primary" onClick={() => void continueFromAccount()} loading={accountBusy} disabled={!canContinueAccount()}>
                  Continue
                </Button>
              )}
              {step === 2 && (
                <Button variant="primary" onClick={() => setStep(3)}>
                  Continue
                </Button>
              )}
              {step === 3 && (
                <Button variant="primary" onClick={() => setStep(4)} disabled={checking}>
                  Continue
                </Button>
              )}
              {step === 4 && (
                <Button variant="primary" onClick={finish} loading={finishing}>
                  Finish Setup
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Steps --------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="onboarding__welcome">
      <span className="onboarding__logo" aria-hidden="true">
        VM
      </span>
      <h1 className="onboarding__title">Welcome to {APP.name}</h1>
      <p className="onboarding__lead">A simple, modern way to run virtual machines on Windows - 100% free, no subscription.</p>
      <div className="onboarding__welcome-actions">
        <Button variant="primary" onClick={onNext}>
          Get Started
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void closeWindow()}>
          Exit
        </Button>
      </div>
    </div>
  );
}

interface AccountSetupProps {
  username: string;
  onUsernameChange: (v: string) => void;
  hasPassword: boolean;
  wantsPassword: boolean;
  onWantsPasswordChange: (v: boolean) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (v: string) => void;
  error: string | null;
}

function AccountSetupStep({
  username,
  onUsernameChange,
  hasPassword,
  wantsPassword,
  onWantsPasswordChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  error,
}: AccountSetupProps) {
  const mismatch = wantsPassword && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="onboarding__step">
      <h2 className="onboarding__heading">Create your profile</h2>
      <p className="onboarding__description">Your username shows up throughout the app. A password is optional and never leaves this PC.</p>
      <Card>
        <Field label="Username">
          <TextInput value={username} onChange={(e) => onUsernameChange(e.target.value)} placeholder="Thomsen" autoFocus />
        </Field>

        <div className="rule onboarding__field-spaced" />

        {hasPassword ? (
          <div className="onboarding__row">
            <div>
              <p className="onboarding__row-title">Password protection</p>
              <p className="onboarding__hint">Already enabled on this PC - change or disable it later in Settings → Profile &amp; Security.</p>
            </div>
            <Badge tone="good">Enabled</Badge>
          </div>
        ) : (
          <>
            <PasswordInput label="Password" value={password} onChange={onPasswordChange} placeholder="At least 6 characters" disabled={!wantsPassword} />
            {wantsPassword && (
              <div className="onboarding__field-spaced">
                <PasswordStrengthMeter password={password} />
              </div>
            )}
            <div className="onboarding__field-spaced">
              <PasswordInput label="Confirm password" value={confirmPassword} onChange={onConfirmPasswordChange} placeholder="Re-enter your password" disabled={!wantsPassword} />
            </div>
            {mismatch && <p className="onboarding__hint onboarding__error-text onboarding__field-spaced">Passwords do not match.</p>}

            <div className="rule onboarding__field-spaced" />

            <div className="onboarding__row">
              <div>
                <p className="onboarding__row-title">Require password when opening the application</p>
                <p className="onboarding__hint">Optional and fully local - stored only on this PC, never sent anywhere.</p>
              </div>
              <Toggle checked={wantsPassword} onChange={onWantsPasswordChange} label="Require password when opening the application" />
            </div>
          </>
        )}

        {error && <p className="onboarding__hint onboarding__error-text onboarding__field-spaced">{error}</p>}
      </Card>
    </div>
  );
}

interface AppearanceProps {
  theme: ThemeSetting;
  onThemeChange: (t: ThemeSetting) => void;
  windowStyle: WindowStyle;
  onWindowStyleChange: (s: WindowStyle) => void;
}

function AppearanceStep({ theme, onThemeChange, windowStyle, onWindowStyleChange }: AppearanceProps) {
  return (
    <div className="onboarding__step">
      <h2 className="onboarding__heading">Appearance</h2>
      <p className="onboarding__description">Every choice here applies immediately - this window is already showing it. Change it anytime in Settings.</p>

      <Card>
        <Field label="Theme">
          <SegmentedControl aria-label="Theme" options={THEME_OPTIONS} value={theme} onChange={onThemeChange} />
        </Field>
      </Card>

      <div className="onboarding__cards">
        <button type="button" className={["onboarding__card", windowStyle === "macos" ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => onWindowStyleChange("macos")}>
          <div className="onboarding__winmock">
            <span className="onboarding__mockdot onboarding__mockdot--close" />
            <span className="onboarding__mockdot onboarding__mockdot--min" />
            <span className="onboarding__mockdot onboarding__mockdot--max" />
          </div>
          <span className="onboarding__card-title">macOS style</span>
          <span className="onboarding__card-hint">Colored traffic-light controls</span>
        </button>
        <button type="button" className={["onboarding__card", windowStyle === "windows" ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => onWindowStyleChange("windows")}>
          <div className="onboarding__winmock onboarding__winmock--windows">
            <span className="onboarding__winmock-btn">─</span>
            <span className="onboarding__winmock-btn">□</span>
            <span className="onboarding__winmock-btn onboarding__winmock-btn--close">✕</span>
          </div>
          <span className="onboarding__card-title">Windows style</span>
          <span className="onboarding__card-hint">Minimize, maximize, close</span>
        </button>
      </div>
    </div>
  );
}

interface VmSetupProps {
  host: HostFacts | null;
  qemu: ProviderAvailability | null;
  checking: boolean;
  onRecheck: () => void;
  vtLabel: string;
  autoHw: AutomaticHardware | null;
  maxCpu: number;
  maxRamGb: number;
  cpuCores: number;
  onCpuChange: (v: number) => void;
  ramGb: number;
  onRamChange: (v: number) => void;
  diskGb: number;
  onDiskChange: (v: number) => void;
  folderPath: string;
  onFolderChange: (v: string) => void;
  onChooseFolder: () => void;
  onUseDefaultFolder: () => void;
}

function VmSetupStep({
  host,
  qemu,
  checking,
  onRecheck,
  vtLabel,
  autoHw,
  maxCpu,
  maxRamGb,
  cpuCores,
  onCpuChange,
  ramGb,
  onRamChange,
  diskGb,
  onDiskChange,
  folderPath,
  onFolderChange,
  onChooseFolder,
  onUseDefaultFolder,
}: VmSetupProps) {
  return (
    <div className="onboarding__step">
      <h2 className="onboarding__heading">VM Setup</h2>
      <p className="onboarding__description">A real check of this PC, and sensible defaults for new virtual machines - change any of this later in Settings.</p>

      <Card>
        <div className="onboarding__rows">
          <div className="onboarding__row">
            <div>
              <p className="onboarding__row-title">{vtLabel}</p>
              <p className="onboarding__hint">{host?.cpuName ?? "Checking processor…"}</p>
            </div>
            {checking ? <Spinner size={16} /> : host?.virtualizationFirmwareEnabled ? <CheckIcon size={16} className="onboarding__check-ok" /> : <XIcon size={16} className="onboarding__check-fail" />}
          </div>
          <div className="onboarding__row">
            <div>
              <p className="onboarding__row-title">QEMU virtualization backend</p>
              <p className="onboarding__hint">{qemu?.available ? `Detected (${qemu.version})` : "Used to run your virtual machines."}</p>
            </div>
            {checking ? <Spinner size={16} /> : qemu?.available ? <CheckIcon size={16} className="onboarding__check-ok" /> : <XIcon size={16} className="onboarding__check-fail" />}
          </div>
        </div>

        {!checking && host && !host.virtualizationFirmwareEnabled && (
          <p className="onboarding__hint onboarding__error-text onboarding__field-spaced">
            Hardware virtualization looks disabled. It usually needs to be turned on in your PC's BIOS/UEFI settings (often called "{vtLabel}", "SVM Mode", or "Virtualization
            Technology") - Thomsen VM can't change this for you automatically, and won't stop working because of it. You can still continue setup and enable it later.
          </p>
        )}
        {!checking && qemu && !qemu.available && (
          <p className="onboarding__hint onboarding__error-text onboarding__field-spaced">{qemu.suggestedFix ?? "Install QEMU for Windows, then reopen Thomsen VM."}</p>
        )}
        {!checking && (
          <Button size="sm" variant="secondary" className="onboarding__refresh" onClick={onRecheck}>
            Recheck
          </Button>
        )}
      </Card>

      <Card>
        <div className="onboarding__hwrec">
          <div>
            <span className="onboarding__hwrec-label">System RAM</span>
            <span className="onboarding__hwrec-value">{host ? formatMb(host.ramTotalMb) : "—"}</span>
          </div>
          <div>
            <span className="onboarding__hwrec-label">Recommended VM RAM</span>
            <span className="onboarding__hwrec-value">{autoHw ? formatMb(autoHw.ramMb) : "—"}</span>
          </div>
          <div>
            <span className="onboarding__hwrec-label">System CPU</span>
            <span className="onboarding__hwrec-value">{host ? `${host.cpuCoresLogical} cores` : "—"}</span>
          </div>
          <div>
            <span className="onboarding__hwrec-label">Recommended VM CPU</span>
            <span className="onboarding__hwrec-value">{autoHw ? `${autoHw.cpuCores} cores` : "—"}</span>
          </div>
        </div>

        <div className="rule onboarding__field-spaced" />

        <div className="onboarding__hw-grid onboarding__field-spaced">
          <Field label="CPU cores" hint={`Up to ${maxCpu} on this PC`}>
            <TextInput type="number" min={1} max={maxCpu} value={cpuCores} onChange={(e) => onCpuChange(Math.max(1, Math.min(maxCpu, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="RAM (GB)" hint={`Up to ${maxRamGb.toFixed(1)} GB`}>
            <TextInput type="number" min={0.5} step={0.5} max={maxRamGb} value={ramGb} onChange={(e) => onRamChange(Math.max(0.5, Math.min(maxRamGb, Number(e.target.value) || 0.5)))} />
          </Field>
          <Field label="Storage (GB)">
            <TextInput type="number" min={1} max={4000} value={diskGb} onChange={(e) => onDiskChange(Math.max(1, Math.min(4000, Number(e.target.value) || 1)))} />
          </Field>
        </div>

        <div className="rule onboarding__field-spaced" />

        <Field label="VM storage folder" className="onboarding__field-spaced">
          <div className="onboarding__path">
            <TextInput value={folderPath} onChange={(e) => onFolderChange(e.target.value)} />
            {isTauri() && (
              <Button size="sm" variant="secondary" onClick={onChooseFolder}>
                Change Folder
              </Button>
            )}
          </div>
        </Field>
        <div className="onboarding__workspace-actions">
          <Button size="sm" variant="ghost" onClick={onUseDefaultFolder}>
            Use Default
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface FinishProps {
  username: string;
  passwordProtected: boolean;
  theme: ThemeSetting;
  cpuCores: number;
  ramGb: number;
  diskGb: number;
  virtualizationEnabled: boolean | null;
}

function FinishStep({ username, passwordProtected, theme, cpuCores, ramGb, diskGb, virtualizationEnabled }: FinishProps) {
  return (
    <div className="onboarding__step">
      <h2 className="onboarding__heading">You're ready</h2>
      <p className="onboarding__description">Everything below can be changed later from Settings.</p>
      <Card>
        <div className="onboarding__rows">
          <div className="onboarding__row">
            <span>Username</span>
            <span className="mono">{username || "—"}</span>
          </div>
          <div className="onboarding__row">
            <span>Password protection</span>
            <Badge tone={passwordProtected ? "good" : "neutral"}>{passwordProtected ? "Enabled" : "Disabled"}</Badge>
          </div>
          <div className="onboarding__row">
            <span>Theme</span>
            <span className="mono">{THEME_LABELS[theme]}</span>
          </div>
          <div className="onboarding__row">
            <span>VM RAM</span>
            <span className="mono">{ramGb} GB</span>
          </div>
          <div className="onboarding__row">
            <span>VM CPU</span>
            <span className="mono">{cpuCores} cores</span>
          </div>
          <div className="onboarding__row">
            <span>Storage</span>
            <span className="mono">{diskGb} GB</span>
          </div>
          <div className="onboarding__row">
            <span>Virtualization</span>
            <Badge tone={virtualizationEnabled ? "good" : "warn"}>{virtualizationEnabled ? "Enabled" : "Check BIOS/UEFI"}</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
