import { useEffect, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { useToast } from "@/components/ui/Toast";
import { UploadIcon, FolderIcon } from "@/components/icons";
import { useNavigation } from "@/state/NavigationProvider";
import { useSettings } from "@/state/SettingsProvider";
import { createVm, detectIso, getAutomaticHardware } from "@/services/vms";
import { openDialog } from "@/services/os";
import { watchFileDrop } from "@/services/dragdrop";
import { asAppError, isTauri } from "@/services/ipc";
import { capitalize, formatBytes } from "@/lib/format";
import { CUSTOM_RECOMMENDED, FIRMWARE_MODES, NETWORK_MODES, OS_PRESETS, presetById } from "@/config/presets";
import type { AppErrorShape, DetectedIso, FirmwareMode, NetworkMode, OsFamily, OsPreset } from "@/types";
import "./CreateVmWizard.css";

const STEP_COUNT = 6;
const STEP_LABELS = ["Name", "Operating System", "ISO", "Hardware", "Network", "Summary"];

const FAMILY_OPTIONS: { value: OsFamily; label: string }[] = [
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "other", label: "Other" },
];

export function CreateVmWizard() {
  const { navigate, openVmDetails } = useNavigation();
  const { settings } = useSettings();
  const toast = useToast();

  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [osFamily, setOsFamily] = useState<OsFamily>("linux");
  const [osPreset, setOsPreset] = useState<OsPreset | null>(null);

  const [isoPath, setIsoPath] = useState<string | null>(null);
  const [isoInfo, setIsoInfo] = useState<DetectedIso | null>(null);
  const [isoBusy, setIsoBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const recommended = presetById(osPreset ?? undefined)?.recommended ?? CUSTOM_RECOMMENDED[osFamily];
  const [automatic, setAutomatic] = useState(true);
  const [cpuCores, setCpuCores] = useState(settings.defaultCpuCores);
  const [ramGb, setRamGb] = useState(settings.defaultRamMb / 1024);
  const [diskGb, setDiskGb] = useState(recommended.diskGb);
  const [maxCpuCores, setMaxCpuCores] = useState(16);
  const [maxRamGb, setMaxRamGb] = useState(16);
  const [firmware, setFirmware] = useState<FirmwareMode>("uefi");

  const [networkMode, setNetworkMode] = useState<NetworkMode>(settings.defaultNetworkMode);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<AppErrorShape | null>(null);

  // Re-apply the preset's recommended values (and re-fetch host-safe limits)
  // whenever the chosen OS changes, while "Automatic" is on.
  useEffect(() => {
    const r = presetById(osPreset ?? undefined)?.recommended ?? CUSTOM_RECOMMENDED[osFamily];
    void getAutomaticHardware(r.cpuCores, r.ramMb).then((auto) => {
      setMaxCpuCores(auto.maxCpuCores);
      setMaxRamGb(auto.maxRamMb / 1024);
      if (automatic) {
        setCpuCores(auto.cpuCores);
        setRamGb(Math.round((auto.ramMb / 1024) * 10) / 10);
      }
    });
    setDiskGb(r.diskGb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osFamily, osPreset]);

  useEffect(() => {
    if (!automatic) return;
    const r = presetById(osPreset ?? undefined)?.recommended ?? CUSTOM_RECOMMENDED[osFamily];
    void getAutomaticHardware(r.cpuCores, r.ramMb).then((auto) => {
      setCpuCores(auto.cpuCores);
      setRamGb(Math.round((auto.ramMb / 1024) * 10) / 10);
      setMaxCpuCores(auto.maxCpuCores);
      setMaxRamGb(auto.maxRamMb / 1024);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatic]);

  useEffect(() => {
    let unsub = () => {};
    void watchFileDrop(
      (paths) => {
        const iso = paths.find((p) => p.toLowerCase().endsWith(".iso"));
        if (iso) void inspectIso(iso);
      },
      setDragOver,
    ).then((fn) => {
      unsub = fn;
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspectIso = async (path: string) => {
    setIsoBusy(true);
    try {
      const info = await detectIso(path);
      setIsoPath(path);
      setIsoInfo(info);
    } catch (e) {
      toast.error(asAppError(e).message);
    } finally {
      setIsoBusy(false);
    }
  };

  const browseIso = async () => {
    const path = await openDialog({ title: "Choose an ISO file", filters: [{ name: "Disc image", extensions: ["iso"] }] });
    if (path) void inspectIso(path);
  };

  const applyDetectedOs = () => {
    if (!isoInfo?.osFamilyGuess) return;
    setOsFamily(isoInfo.osFamilyGuess);
    setOsPreset(isoInfo.presetGuess);
  };

  const canContinue = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 3) return cpuCores >= 1 && ramGb > 0 && diskGb >= 1;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const vm = await createVm({
        name: name.trim(),
        osFamily,
        osPreset,
        isoPath,
        cpuCores,
        ramMb: Math.round(ramGb * 1024),
        diskGb,
        networkMode,
        firmware,
      });
      toast.success(`"${vm.name}" was created`);
      openVmDetails(vm.id);
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setCreating(false);
    }
  };

  const presetLabel = presetById(osPreset ?? undefined)?.label ?? (osFamily === "windows" ? "Windows (custom)" : osFamily === "linux" ? "Linux (custom)" : "Other");

  return (
    <Page title="Create Virtual Machine" eyebrow="Setup wizard" description="A few quick steps - Thomsen VM recommends sensible defaults along the way.">
      <div className="wizard">
        <div className="wizard__progress">
          <span className="wizard__step-label">
            Step {step + 1} of {STEP_COUNT} · {STEP_LABELS[step]}
          </span>
          <div className="wizard__bar">
            <div className="wizard__bar-fill" style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
          </div>
        </div>

        <div className="wizard__content" key={step}>
          {step === 0 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Name your virtual machine</h2>
              <p className="wizard__description">Pick something you'll recognize later - you can rename it anytime.</p>
              <Card>
                <Field label="VM Name">
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Kali Lab" autoFocus />
                </Field>
              </Card>
            </div>
          )}

          {step === 1 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Choose an operating system</h2>
              <p className="wizard__description">Presets only configure recommended settings - you always supply your own installer ISO.</p>
              <SegmentedControl aria-label="OS family" options={FAMILY_OPTIONS} value={osFamily} onChange={(v) => { setOsFamily(v); setOsPreset(null); }} />
              <div className="wizard__cards">
                {OS_PRESETS.filter((p) => p.family === osFamily).map((p) => (
                  <button key={p.id} type="button" className={["wizard__card", osPreset === p.id ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => setOsPreset(p.id)}>
                    <span className="wizard__card-title">{p.label}</span>
                    <span className="wizard__card-hint">
                      {p.recommended.cpuCores} cores · {p.recommended.ramMb / 1024} GB RAM · {p.recommended.diskGb} GB
                    </span>
                  </button>
                ))}
                <button type="button" className={["wizard__card", osPreset === null ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => setOsPreset(null)}>
                  <span className="wizard__card-title">Custom {osFamily === "other" ? "" : capitalize(osFamily)}</span>
                  <span className="wizard__card-hint">Choose your own hardware in the next steps.</span>
                </button>
              </div>
              {presetById(osPreset ?? undefined)?.note && <p className="wizard__note">{presetById(osPreset ?? undefined)?.note}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Select an ISO</h2>
              <p className="wizard__description">Browse for a file or drag one onto this window. Thomsen VM never downloads or bundles operating system images.</p>
              <Card>
                <div className={["wizard__dropzone", dragOver ? "is-over" : ""].filter(Boolean).join(" ")}>
                  <UploadIcon size={22} className="wizard__dropzone-icon" />
                  <p className="wizard__dropzone-title">{isTauri() ? "Drag and drop an ISO here" : "Drag and drop needs the desktop app"}</p>
                  <p className="wizard__dropzone-hint">or</p>
                  <Button size="sm" variant="secondary" icon={<FolderIcon size={14} />} onClick={browseIso} loading={isoBusy}>
                    Browse…
                  </Button>
                </div>

                {isoInfo && (
                  <div className="wizard__iso-result">
                    <div className="wizard__iso-row">
                      <span>Filename</span>
                      <span className="mono selectable">{isoInfo.fileName}</span>
                    </div>
                    <div className="wizard__iso-row">
                      <span>File size</span>
                      <span className="mono">{formatBytes(isoInfo.sizeBytes)}</span>
                    </div>
                    <div className="wizard__iso-row">
                      <span>Detected OS</span>
                      <span className="mono">{presetById(isoInfo.presetGuess ?? undefined)?.label ?? (isoInfo.osFamilyGuess ? capitalize(isoInfo.osFamilyGuess) : "Unknown")}</span>
                    </div>
                    {isoInfo.osFamilyGuess && isoInfo.presetGuess !== osPreset && (
                      <Button size="sm" variant="ghost" onClick={applyDetectedOs} className="wizard__iso-apply">
                        Use detected OS
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}

          {step === 3 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Hardware</h2>
              <p className="wizard__description">
                Recommended for {presetLabel}: {recommended.cpuCores} cores, {recommended.ramMb / 1024} GB RAM, {recommended.diskGb} GB storage.
              </p>
              <Card>
                <Field label="Allocation" hint="Automatic keeps this VM from ever slowing down the rest of Windows.">
                  <SegmentedControl
                    aria-label="Allocation mode"
                    options={[
                      { value: "auto", label: "Automatic" },
                      { value: "manual", label: "Manual" },
                    ]}
                    value={automatic ? "auto" : "manual"}
                    onChange={(v) => setAutomatic(v === "auto")}
                  />
                </Field>
                <div className="wizard__hw-grid">
                  <Field label="CPU cores" hint={`Up to ${maxCpuCores} on this PC`}>
                    <TextInput
                      type="number"
                      min={1}
                      max={maxCpuCores}
                      value={cpuCores}
                      disabled={automatic}
                      onChange={(e) => setCpuCores(Math.max(1, Math.min(maxCpuCores, Number(e.target.value) || 1)))}
                    />
                  </Field>
                  <Field label="RAM (GB)" hint={`Up to ${maxRamGb.toFixed(1)} GB on this PC`}>
                    <TextInput
                      type="number"
                      min={0.5}
                      step={0.5}
                      max={maxRamGb}
                      value={ramGb}
                      disabled={automatic}
                      onChange={(e) => setRamGb(Math.max(0.5, Math.min(maxRamGb, Number(e.target.value) || 0.5)))}
                    />
                  </Field>
                  <Field label="Storage (GB)" hint="Grows as needed, up to this size">
                    <TextInput type="number" min={1} max={4000} value={diskGb} onChange={(e) => setDiskGb(Math.max(1, Math.min(4000, Number(e.target.value) || 1)))} />
                  </Field>
                </div>

                <Field className="wizard__firmware-field" label="Firmware" hint="UEFI is recommended for every current OS, including Windows 11 and modern Linux.">
                  <SegmentedControl aria-label="Firmware" options={FIRMWARE_MODES.map((f) => ({ value: f.id, label: f.label }))} value={firmware} onChange={setFirmware} />
                </Field>
              </Card>
            </div>
          )}

          {step === 4 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Network</h2>
              <p className="wizard__description">Keep this simple - NAT works for almost everyone.</p>
              <div className="wizard__cards wizard__cards--network">
                {NETWORK_MODES.map((n) => (
                  <button key={n.id} type="button" className={["wizard__card", networkMode === n.id ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => setNetworkMode(n.id)}>
                    <span className="wizard__card-title">{n.label}</span>
                    <span className="wizard__card-hint">{n.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="wizard__step">
              <h2 className="wizard__heading">Review and create</h2>
              <p className="wizard__description">Everything below can be changed later from this VM's Settings.</p>
              <Card>
                <div className="wizard__rows">
                  <div className="wizard__row">
                    <span>Name</span>
                    <span className="mono">{name || "—"}</span>
                  </div>
                  <div className="wizard__row">
                    <span>OS</span>
                    <span className="mono">{presetLabel}</span>
                  </div>
                  <div className="wizard__row">
                    <span>CPU</span>
                    <span className="mono">{cpuCores} cores</span>
                  </div>
                  <div className="wizard__row">
                    <span>RAM</span>
                    <span className="mono">{ramGb} GB</span>
                  </div>
                  <div className="wizard__row">
                    <span>Storage</span>
                    <span className="mono">{diskGb} GB</span>
                  </div>
                  <div className="wizard__row">
                    <span>Firmware</span>
                    <span className="mono">{FIRMWARE_MODES.find((f) => f.id === firmware)?.label}</span>
                  </div>
                  <div className="wizard__row">
                    <span>Network</span>
                    <span className="mono">{NETWORK_MODES.find((n) => n.id === networkMode)?.label}</span>
                  </div>
                  <div className="wizard__row">
                    <span>ISO</span>
                    <span className="mono">{isoInfo?.fileName ?? "None selected"}</span>
                  </div>
                </div>
              </Card>
              {error && (
                <div className="wizard__error">
                  <ErrorNotice error={error} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="wizard__nav">
          <Button variant="ghost" onClick={step === 0 ? () => navigate("vms") : goBack} disabled={creating}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEP_COUNT - 1 ? (
            <Button variant="primary" onClick={goNext} disabled={!canContinue()}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={create} loading={creating} disabled={!name.trim()}>
              Create Virtual Machine
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}
