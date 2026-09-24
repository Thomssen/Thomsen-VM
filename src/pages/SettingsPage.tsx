import { useEffect, useState } from "react";
import { Page, Section } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Select } from "@/components/ui/Field";
import { Listbox } from "@/components/ui/Listbox";
import { PasswordInput, PasswordStrengthMeter } from "@/components/ui/PasswordInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/state/SettingsProvider";
import { useLock } from "@/state/LockProvider";
import { getAppInfo, getLogsFolder, getDefaultVmFolder } from "@/services/system";
import { resetSettings } from "@/services/settings";
import { openDialog, openPath } from "@/services/os";
import { errorMessage, isTauri } from "@/services/ipc";
import { listMonitors, type MonitorInfo } from "@/services/window";
import { APP } from "@/config/app";
import { NETWORK_MODES, SCALING_MODES } from "@/config/presets";
import type { NetworkMode, ScalingMode, ThemeSetting, WindowStyle } from "@/types";
import "./SettingsPage.css";

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const WINDOW_STYLE_OPTIONS: { value: WindowStyle; label: string }[] = [
  { value: "macos", label: "macOS" },
  { value: "windows", label: "Windows" },
];

const SCALING_MODE_OPTIONS: { value: ScalingMode; label: string }[] = SCALING_MODES.map((m) => ({ value: m.id, label: m.label }));

export function SettingsPage() {
  const { settings, update } = useSettings();
  const { hasPassword, lock } = useLock();
  const toast = useToast();

  const [dataDir, setDataDir] = useState("");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSetupReset, setConfirmSetupReset] = useState(false);

  const [usernameDraft, setUsernameDraft] = useState(settings.username);
  const [folderDraft, setFolderDraft] = useState(settings.defaultVmFolder ?? "");
  const [cpuDraft, setCpuDraft] = useState(String(settings.defaultCpuCores));
  const [ramDraft, setRamDraft] = useState(String(settings.defaultRamMb / 1024));
  const [diskDraft, setDiskDraft] = useState(String(settings.defaultDiskGb));

  const [createPasswordOpen, setCreatePasswordOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [disablePasswordOpen, setDisablePasswordOpen] = useState(false);

  useEffect(() => {
    void getAppInfo().then((i) => setDataDir(i.dataDir)).catch(() => {});
    void listMonitors().then(setMonitors).catch(() => {});
  }, []);

  useEffect(() => {
    setUsernameDraft(settings.username);
  }, [settings.username]);

  useEffect(() => {
    setFolderDraft(settings.defaultVmFolder ?? "");
    setCpuDraft(String(settings.defaultCpuCores));
    setRamDraft(String(settings.defaultRamMb / 1024));
    setDiskDraft(String(settings.defaultDiskGb));
  }, [settings.defaultVmFolder, settings.defaultCpuCores, settings.defaultRamMb, settings.defaultDiskGb]);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const commitUsername = () => {
    const trimmed = usernameDraft.trim();
    if (trimmed === settings.username) return;
    if (!trimmed) {
      setUsernameDraft(settings.username);
      return;
    }
    void update({ username: trimmed });
  };

  const chooseFolder = async () => {
    const path = await openDialog({ title: "Choose a VM folder", directory: true });
    if (!path) return;
    setFolderDraft(path);
    await update({ defaultVmFolder: path });
  };

  const useDefaultFolder = () =>
    guard(async () => {
      const dir = await getDefaultVmFolder();
      setFolderDraft(dir);
      await update({ defaultVmFolder: null });
    });

  const saveHardwareDefaults = () =>
    guard(async () => {
      const cpu = Math.max(1, Math.round(Number(cpuDraft) || 1));
      const ramMb = Math.max(256, Math.round((Number(ramDraft) || 1) * 1024));
      const diskGb = Math.max(1, Math.round(Number(diskDraft) || 1));
      await update({ defaultCpuCores: cpu, defaultRamMb: ramMb, defaultDiskGb: diskGb });
      toast.success("Defaults saved");
    });

  const openLogs = () =>
    guard(async () => {
      const folder = await getLogsFolder();
      await openPath(folder);
    });

  const doReset = () =>
    guard(async () => {
      await resetSettings();
      const next = await getDefaultVmFolder().catch(() => "");
      setFolderDraft(next);
      setConfirmReset(false);
      toast.success("Settings reset to defaults");
      window.location.reload();
    });

  const runSetupAgain = () =>
    guard(async () => {
      await update({ onboardingCompleted: false });
      setConfirmSetupReset(false);
    });

  return (
    <Page title="Settings" eyebrow="Preferences">
      <div className="stack">
        <Section title="Profile & Security">
          <Card>
            <Field label="Username" hint="Shown on the Dashboard greeting and throughout the app.">
              <TextInput
                value={usernameDraft}
                placeholder="Thomsen"
                onChange={(e) => setUsernameDraft(e.target.value)}
                onBlur={commitUsername}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
            </Field>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">App Password</p>
                <p className="settings__row-hint">Require a password each time Thomsen VM opens.</p>
              </div>
              <Badge tone={hasPassword ? "good" : "neutral"}>{hasPassword ? "Enabled" : "Disabled"}</Badge>
            </div>

            <div className="rule settings__rule" />

            <div className="settings__actions">
              {hasPassword ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setChangePasswordOpen(true)}>
                    Change Password
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDisablePasswordOpen(true)}>
                    Disable Password Protection
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setCreatePasswordOpen(true)}>
                  Enable Password Protection
                </Button>
              )}
            </div>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Require login on startup</p>
                <p className="settings__row-hint">Ask for your password when Thomsen VM opens. Turn this off to skip straight to the app on launch - you can still lock it manually at any time.</p>
              </div>
              <Toggle
                checked={settings.requireLoginOnStartup}
                onChange={(v) => void update({ requireLoginOnStartup: v })}
                disabled={!hasPassword}
                label="Require login on startup"
              />
            </div>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Log out</p>
                <p className="settings__row-hint">Lock Thomsen VM and return to the login screen. Nothing is deleted - your account, settings and virtual machines stay exactly as they are, and any running VM keeps running in the background.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={lock} disabled={!hasPassword}>
                Log Out
              </Button>
            </div>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Run setup again</p>
                <p className="settings__row-hint">Reopen the first-run setup wizard - your username, password, and every other setting stay intact. Virtual machines are never affected.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setConfirmSetupReset(true)}>
                Reset First-Run Setup
              </Button>
            </div>

            <div className="rule settings__rule" />

            <p className="settings__row-hint">
              Your password is stored locally (never as plain text) and Thomsen cannot recover it for you. If you forget it, remove it via Windows Credential Manager (search "Credential
              Manager" in the Start menu → Windows Credentials → remove the "Thomsen VM" entry) - your virtual machines are not affected.
            </p>
          </Card>
        </Section>

        <Section title="Appearance">
          <Card>
            <Field label="Theme">
              <SegmentedControl aria-label="Theme" options={THEME_OPTIONS} value={settings.theme} onChange={(theme) => void update({ theme })} />
            </Field>
            <div className="rule settings__rule" />
            <Field label="Window controls" hint="The shape of the minimize/maximize/close controls in the title bar.">
              <SegmentedControl aria-label="Window style" options={WINDOW_STYLE_OPTIONS} value={settings.windowStyle} onChange={(windowStyle) => void update({ windowStyle })} />
            </Field>
          </Card>
        </Section>

        <Section title="Display">
          <Card>
            <Field label="VM Monitor" hint="Which display a virtual machine's console goes full screen on.">
              <Listbox
                aria-label="VM Monitor"
                value={settings.vmMonitor ?? ""}
                onChange={(v) => void update({ vmMonitor: v || null })}
                placeholder="Whichever monitor the window is on"
                options={[
                  { value: "", label: "Whichever monitor the window is on" },
                  ...monitors.map((m, i) => ({
                    value: m.name ?? `__unnamed-${i}`,
                    label: `${m.name ?? "Unnamed display"} — ${m.width}×${m.height}`,
                    description: m.isPrimary ? "Primary monitor" : "Secondary monitor",
                    disabled: !m.name,
                  })),
                ]}
              />
            </Field>

            <div className="rule settings__rule" />

            <Field label="Scaling Mode" hint="How the guest picture fills the console window.">
              <SegmentedControl aria-label="Scaling mode" options={SCALING_MODE_OPTIONS} value={settings.scalingMode} onChange={(scalingMode) => void update({ scalingMode })} />
            </Field>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Keep Aspect Ratio</p>
                <p className="settings__row-hint">Only applies to Stretch - keeps proportions instead of distorting the picture to fill the window exactly.</p>
              </div>
              <Toggle
                checked={settings.keepAspectRatio}
                onChange={(v) => void update({ keepAspectRatio: v })}
                disabled={settings.scalingMode !== "stretch"}
                label="Keep aspect ratio"
              />
            </div>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Auto Resize Guest</p>
                <p className="settings__row-hint">Ask the guest to match its resolution to the window when it changes. Only takes effect if the guest OS supports it.</p>
              </div>
              <Toggle checked={settings.autoResizeGuest} onChange={(v) => void update({ autoResizeGuest: v })} label="Auto resize guest" />
            </div>

            <div className="rule settings__rule" />

            <div className="settings__row">
              <div>
                <p className="settings__row-title">Remember full screen</p>
                <p className="settings__row-hint">Reopen a VM's console in full screen if that's how you left it.</p>
              </div>
              <Toggle checked={settings.rememberFullscreen} onChange={(v) => void update({ rememberFullscreen: v })} label="Remember full screen" />
            </div>
          </Card>
        </Section>

        <Section title="Application">
          <Card>
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Start with Windows</p>
                <p className="settings__row-hint">Launch Thomsen VM automatically when you sign in.</p>
              </div>
              <Toggle checked={settings.startWithWindows} onChange={(v) => void update({ startWithWindows: v })} label="Start with Windows" />
            </div>
            <div className="rule settings__rule" />
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Remember window position</p>
                <p className="settings__row-hint">Reopen at the same size and position next time.</p>
              </div>
              <Toggle checked={settings.rememberWindowPosition} onChange={(v) => void update({ rememberWindowPosition: v })} label="Remember window position" />
            </div>
            <div className="rule settings__rule" />
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Check for updates</p>
                <p className="settings__row-hint">Look for a newer version of Thomsen VM on startup.</p>
              </div>
              <Toggle checked={settings.checkForUpdates} onChange={(v) => void update({ checkForUpdates: v })} label="Check for updates" />
            </div>
            <div className="rule settings__rule" />
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Confirm before deleting VMs</p>
                <p className="settings__row-hint">Ask before permanently deleting a virtual machine and its disk.</p>
              </div>
              <Toggle checked={settings.confirmBeforeDeleteVms} onChange={(v) => void update({ confirmBeforeDeleteVms: v })} label="Confirm before deleting VMs" />
            </div>
            <div className="rule settings__rule" />
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Logs</p>
                <p className="settings__row-hint">VM creation, startup, shutdown and backend errors are logged locally. No passwords or VM contents are ever logged.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={openLogs} disabled={busy}>
                Open Logs Folder
              </Button>
            </div>
          </Card>
        </Section>

        <Section title="Virtual Machines">
          <Card>
            <Field label="Default VM folder" hint="Where new virtual machines are created.">
              <div className="settings__path">
                <TextInput value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} placeholder="Documents\Thomsen VM\VirtualMachines" />
                {isTauri() && (
                  <Button size="sm" variant="secondary" onClick={() => void chooseFolder()}>
                    Change Folder
                  </Button>
                )}
              </div>
            </Field>
            <div className="settings__actions">
              <Button size="sm" variant="ghost" onClick={() => void useDefaultFolder()} disabled={busy}>
                Use Default
              </Button>
            </div>

            <div className="rule settings__rule" />

            <div className="settings__grid">
              <Field label="Default CPU allocation" hint="Cores suggested for new VMs.">
                <TextInput type="number" min={1} max={32} value={cpuDraft} onChange={(e) => setCpuDraft(e.target.value)} onBlur={saveHardwareDefaults} />
              </Field>
              <Field label="Default RAM allocation (GB)" hint="RAM suggested for new VMs.">
                <TextInput type="number" min={0.5} step={0.5} max={128} value={ramDraft} onChange={(e) => setRamDraft(e.target.value)} onBlur={saveHardwareDefaults} />
              </Field>
            </div>
            <div className="settings__grid settings__field-spaced">
              <Field label="Default storage (GB)" hint="Disk size suggested for new VMs.">
                <TextInput type="number" min={1} max={4000} value={diskDraft} onChange={(e) => setDiskDraft(e.target.value)} onBlur={saveHardwareDefaults} />
              </Field>
            </div>

            <div className="rule settings__rule" />

            <Field label="Default network mode">
              <Select value={settings.defaultNetworkMode} onChange={(e) => void update({ defaultNetworkMode: e.target.value as NetworkMode })}>
                {NETWORK_MODES.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        </Section>

        <Section title="Storage">
          <Card>
            <Field label="Application data" hint="Settings and logs are stored here.">
              <div className="settings__path">
                <code className="mono selectable">{dataDir || "…"}</code>
              </div>
            </Field>
          </Card>
        </Section>

        <Section title="About">
          <Card>
            <div className="settings__about">
              <span>{APP.name}</span>
              <span className="mono">v{APP.version}</span>
            </div>
            <p className="settings__about-note">
              100% free - no subscription, no advertisements, no paid tier. Thomsen VM manages virtual machines using QEMU as its virtualization backend; it does not run, scan, or attack
              anything on its own - every VM is controlled by you.
            </p>
            <div className="rule settings__rule" />
            <div className="settings__row">
              <div>
                <p className="settings__row-title">Reset settings</p>
                <p className="settings__row-hint">Restores every setting on this page to its default, including your username and password. Virtual machines are not affected.</p>
              </div>
              <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)} disabled={busy}>
                Reset settings
              </Button>
            </div>
          </Card>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={doReset}
        title="Reset settings"
        busy={busy}
        confirmLabel="Reset"
        message="This restores appearance, application, profile and VM-default preferences to their defaults, including your username and password. Your virtual machines, disks and snapshots are not affected."
      />

      <ConfirmDialog
        open={confirmSetupReset}
        onClose={() => setConfirmSetupReset(false)}
        onConfirm={runSetupAgain}
        title="Reset first-run setup"
        busy={busy}
        confirmLabel="Reset Setup"
        message="This reopens the first-run setup wizard. Your username, password, and every other setting stay exactly as they are - nothing is deleted, and your virtual machines are never affected."
      />

      <CreatePasswordModal open={createPasswordOpen} onClose={() => setCreatePasswordOpen(false)} />
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <DisablePasswordModal open={disablePasswordOpen} onClose={() => setDisablePasswordOpen(false)} />
    </Page>
  );
}

function CreatePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createPassword } = useLock();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword("");
    setConfirm("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await createPassword(password);
      toast.success("Password protection enabled");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Enable Password Protection"
      description="This password is stored locally, never as plain text. Thomsen cannot recover it for you."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Enable Protection
          </Button>
        </>
      }
    >
      <div className="stack stack--sm">
        <PasswordInput label="Password" value={password} onChange={setPassword} placeholder="At least 6 characters" autoFocus />
        <PasswordStrengthMeter password={password} />
        <PasswordInput label="Confirm Password" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" />
        {error && <p className="settings__error-text">{error}</p>}
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword } = useLock();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (next.length < 6) return setError("New password must be at least 6 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success("Password changed");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change Password"
      description="Enter your current password, then your new one."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Change Password
          </Button>
        </>
      }
    >
      <div className="stack stack--sm">
        <PasswordInput label="Current Password" value={current} onChange={setCurrent} autoFocus />
        <PasswordInput label="New Password" value={next} onChange={setNext} placeholder="At least 6 characters" />
        <PasswordStrengthMeter password={next} />
        <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} />
        {error && <p className="settings__error-text">{error}</p>}
      </div>
    </Modal>
  );
}

function DisablePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { disablePassword } = useLock();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await disablePassword(current);
      toast.success("Password protection disabled");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Disable Password Protection"
      description="Thomsen VM will open without asking for a password."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={busy}>
            Disable Protection
          </Button>
        </>
      }
    >
      <div className="stack stack--sm">
        <PasswordInput label="Current Password" value={current} onChange={setCurrent} autoFocus />
        {error && <p className="settings__error-text">{error}</p>}
      </div>
    </Modal>
  );
}
