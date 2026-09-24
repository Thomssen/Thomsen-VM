import { useEffect, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { useToast } from "@/components/ui/Toast";
import { CameraIcon, PlayIcon, RestartIcon, StopIcon, TerminalIcon } from "@/components/icons";
import { useNavigation } from "@/state/NavigationProvider";
import {
  createSnapshot,
  deleteSnapshot,
  deleteVm,
  getAutomaticHardware,
  getVm,
  getVmLiveStats,
  listSnapshots,
  restartVm,
  restoreSnapshot,
  startVm,
  stopVm,
  updateVm,
} from "@/services/vms";
import { openVmConsole } from "@/services/console";
import { revealPath } from "@/services/os";
import { asAppError, errorMessage } from "@/services/ipc";
import { useSettings } from "@/state/SettingsProvider";
import { capitalize, formatDateTime, formatGb, formatMb, formatPercent } from "@/lib/format";
import { FIRMWARE_MODES, NETWORK_MODES, presetById } from "@/config/presets";
import type { AppErrorShape, FirmwareMode, NetworkMode, SnapshotInfo, VmLiveStats, VmSummary } from "@/types";
import "./VmDetailsPage.css";

type Tab = "overview" | "hardware" | "storage" | "network" | "snapshots" | "advanced";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hardware", label: "Hardware" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Network" },
  { id: "snapshots", label: "Snapshots" },
  { id: "advanced", label: "Advanced" },
];

export function VmDetailsPage() {
  const { selectedVmId, navigate } = useNavigation();
  const { settings } = useSettings();
  const toast = useToast();

  const [vm, setVm] = useState<VmSummary | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmForceStop, setConfirmForceStop] = useState(false);

  const reload = () => {
    if (!selectedVmId) return;
    void getVm(selectedVmId).then(setVm).catch((e) => setError(asAppError(e)));
  };

  // Without this, a VM whose process dies on its own (crash, or an
  // abruptly-closed app leaving it orphaned) keeps showing its last-known
  // status indefinitely on this page - the separate live-stats poll below
  // doesn't feed back into it.
  useEffect(() => {
    reload();
    const id = window.setInterval(reload, 2000);
    return () => window.clearInterval(id);
  }, [selectedVmId]);

  if (!selectedVmId) {
    return (
      <Page title="Virtual Machine" eyebrow="Details">
        <EmptyState title="No virtual machine selected" description="Go back to Virtual Machines and choose one." action={<Button onClick={() => navigate("vms")}>Virtual Machines</Button>} />
      </Page>
    );
  }

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(asAppError(e));
    } finally {
      // Reload even on failure - an action failing because the VM's real
      // state already differs from what's displayed (e.g. "not running")
      // is exactly when the stale page most needs correcting.
      reload();
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!vm) return;
    setDeleting(true);
    try {
      await deleteVm(vm.id);
      toast.success(`"${vm.name}" was deleted`);
      navigate("vms");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const requestDelete = () => {
    if (settings.confirmBeforeDeleteVms) setConfirmDelete(true);
    else void doDelete();
  };

  const doForceStop = async () => {
    if (!vm) return;
    setConfirmForceStop(false);
    await runAction(() => stopVm(vm.id, true));
  };

  if (!vm) {
    return (
      <Page title="Loading…" eyebrow="Virtual Machine">
        {error && <ErrorNotice error={error} />}
      </Page>
    );
  }

  const stopped = vm.status === "stopped";
  const osLabel = presetById(vm.osPreset ?? undefined)?.label ?? (vm.osFamily === "windows" ? "Windows" : vm.osFamily === "linux" ? "Linux" : "Other");

  return (
    <Page
      title={vm.name}
      eyebrow="Virtual Machine"
      description={osLabel}
      actions={
        <div className="vmdetails__actions">
          {stopped ? (
            <Button variant="primary" icon={<PlayIcon size={14} />} loading={busy} onClick={() => runAction(() => startVm(vm.id))}>
              Start
            </Button>
          ) : (
            <Button variant="secondary" icon={<StopIcon size={13} />} loading={busy} onClick={() => runAction(() => stopVm(vm.id))}>
              Stop
            </Button>
          )}
          {!stopped && (
            <>
              <Button variant="danger" icon={<StopIcon size={13} />} disabled={busy} onClick={() => setConfirmForceStop(true)}>
                Force Stop
              </Button>
              <Button variant="secondary" icon={<RestartIcon size={13} />} loading={busy} onClick={() => runAction(() => restartVm(vm.id))}>
                Restart
              </Button>
              <Button variant="secondary" icon={<TerminalIcon size={15} />} onClick={() => void openVmConsole(vm.id, vm.name)}>
                Console
              </Button>
            </>
          )}
          <Button variant="danger" disabled={!stopped} onClick={requestDelete}>
            Delete
          </Button>
        </div>
      }
    >
      <div className="vmdetails__tabs">
        <SegmentedControl aria-label="Section" options={TABS.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} />
      </div>

      {error && (
        <div className="vmdetails__error">
          <ErrorNotice error={error} />
        </div>
      )}

      {tab === "overview" && <OverviewTab vm={vm} />}
      {tab === "hardware" && <HardwareTab vm={vm} onSaved={reload} />}
      {tab === "storage" && <StorageTab vm={vm} />}
      {tab === "network" && <NetworkTab vm={vm} onSaved={reload} />}
      {tab === "snapshots" && <SnapshotsTab vm={vm} onChanged={reload} />}
      {tab === "advanced" && <AdvancedTab vm={vm} />}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete virtual machine"
        danger
        busy={deleting}
        confirmLabel="Delete"
        message={`This permanently deletes "${vm.name}", including its virtual disk and any snapshots. This cannot be undone.`}
      />

      <ConfirmDialog
        open={confirmForceStop}
        onClose={() => setConfirmForceStop(false)}
        onConfirm={doForceStop}
        title="Force stop virtual machine"
        danger
        busy={busy}
        confirmLabel="Force Stop"
        message={`This immediately terminates "${vm.name}" without asking the guest OS to shut down first - like pulling the power. Use this when Stop doesn't work (for example, at a boot menu or installer screen). Unsaved work inside the guest may be lost.`}
      />
    </Page>
  );
}

// -- Overview -----------------------------------------------------------------

function useUptime(startedAt: string | null, running: boolean): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (!running || !startedAt) return "—";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function OverviewTab({ vm }: { vm: VmSummary }) {
  const running = vm.status === "running";
  const uptime = useUptime(vm.lastStartedAt, running);
  const [stats, setStats] = useState<VmLiveStats | null>(null);

  useEffect(() => {
    if (!running) {
      setStats(null);
      return;
    }
    let cancelled = false;
    const tick = () => void getVmLiveStats(vm.id).then((s) => !cancelled && setStats(s)).catch(() => {});
    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vm.id, running]);

  return (
    <div className="stack">
      <div className="vmdetails__grid">
        <MiniStat label="Status" value={<Badge tone={vm.status === "running" ? "good" : vm.status === "paused" ? "warn" : "neutral"}>{capitalize(vm.status)}</Badge>} />
        <MiniStat label="Operating system" value={presetById(vm.osPreset ?? undefined)?.label ?? capitalize(vm.osFamily)} />
        <MiniStat label="Uptime" value={uptime} />
        <MiniStat label="CPU usage" value={running ? formatPercent(stats?.cpuPercent) : "—"} />
        <MiniStat label="RAM usage" value={running ? formatMb(stats?.ramUsedMb) : "—"} />
        <MiniStat
          label="Disk activity"
          value={running && stats ? `${Math.round(((stats.diskReadBytesPerSec ?? 0) + (stats.diskWriteBytesPerSec ?? 0)) / 1024)} KB/s` : "—"}
        />
        <MiniStat label="Network activity" value={running ? (stats?.networkAvailable ? "Active" : "Unavailable") : "—"} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="vmdetails__stat">
      <span className="vmdetails__stat-label">{label}</span>
      <span className="vmdetails__stat-value">{value}</span>
    </div>
  );
}

// -- Hardware -------------------------------------------------------------------

function HardwareTab({ vm, onSaved }: { vm: VmSummary; onSaved: () => void }) {
  const toast = useToast();
  const stopped = vm.status === "stopped";
  const [cpuCores, setCpuCores] = useState(vm.cpuCores);
  const [ramGb, setRamGb] = useState(vm.ramMb / 1024);
  const [firmware, setFirmware] = useState<FirmwareMode>(vm.firmware);
  const [maxCpu, setMaxCpu] = useState(vm.cpuCores);
  const [maxRamGb, setMaxRamGb] = useState(vm.ramMb / 1024);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCpuCores(vm.cpuCores);
    setRamGb(vm.ramMb / 1024);
    setFirmware(vm.firmware);
    void getAutomaticHardware(vm.cpuCores, vm.ramMb).then((a) => {
      setMaxCpu(a.maxCpuCores);
      setMaxRamGb(a.maxRamMb / 1024);
    });
  }, [vm.id, vm.cpuCores, vm.ramMb, vm.firmware]);

  const dirty = cpuCores !== vm.cpuCores || Math.round(ramGb * 1024) !== vm.ramMb || firmware !== vm.firmware;

  const save = async () => {
    setSaving(true);
    try {
      await updateVm(vm.id, { cpuCores, ramMb: Math.round(ramGb * 1024), firmware });
      toast.success("Hardware updated");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {!stopped && <p className="vmdetails__lock-hint">Stop this virtual machine to change its hardware.</p>}
      <div className="vmdetails__hw-grid">
        <Field label="CPU cores" hint={`Up to ${maxCpu} on this PC`}>
          <TextInput type="number" min={1} max={maxCpu} value={cpuCores} disabled={!stopped} onChange={(e) => setCpuCores(Math.max(1, Math.min(maxCpu, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="RAM (GB)" hint={`Up to ${maxRamGb.toFixed(1)} GB on this PC`}>
          <TextInput type="number" min={0.5} step={0.5} max={maxRamGb} value={ramGb} disabled={!stopped} onChange={(e) => setRamGb(Math.max(0.5, Math.min(maxRamGb, Number(e.target.value) || 0.5)))} />
        </Field>
        <Field label="Storage (GB)" hint="Set at creation - not yet resizable">
          <TextInput value={vm.diskGb} disabled />
        </Field>
      </div>

      <Field
        className="vmdetails__firmware-field"
        label="Firmware"
        hint="Switching an installed OS to a different firmware mode can stop it from booting - only change this if you know the guest supports it."
      >

        <SegmentedControl aria-label="Firmware" options={FIRMWARE_MODES.map((f) => ({ value: f.id, label: f.label }))} value={firmware} onChange={setFirmware} disabled={!stopped} />
      </Field>

      {stopped && (
        <div className="vmdetails__actions-row">
          <Button variant="primary" size="sm" disabled={!dirty} loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

// -- Storage --------------------------------------------------------------------

function StorageTab({ vm }: { vm: VmSummary }) {
  return (
    <Card>
      <div className="vmdetails__rows">
        <div className="vmdetails__row">
          <span>Format</span>
          <span className="mono">QCOW2 (grows as needed)</span>
        </div>
        <div className="vmdetails__row">
          <span>Allocated size</span>
          <span className="mono">{formatGb(vm.diskGb)}</span>
        </div>
        <div className="vmdetails__row">
          <span>Actual size on disk</span>
          <span className="mono">{vm.diskUsedMb != null ? formatMb(vm.diskUsedMb) : "—"}</span>
        </div>
      </div>
      <div className="vmdetails__actions-row">
        <Button size="sm" variant="secondary" onClick={() => void revealPath(vm.folder)}>
          Open VM Folder
        </Button>
      </div>
    </Card>
  );
}

// -- Network --------------------------------------------------------------------

function NetworkTab({ vm, onSaved }: { vm: VmSummary; onSaved: () => void }) {
  const toast = useToast();
  const stopped = vm.status === "stopped";
  const [mode, setMode] = useState<NetworkMode>(vm.networkMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => setMode(vm.networkMode), [vm.networkMode]);

  const save = async (next: NetworkMode) => {
    setMode(next);
    if (!stopped) return;
    setSaving(true);
    try {
      await updateVm(vm.id, { networkMode: next });
      toast.success("Network mode updated");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {!stopped && <p className="vmdetails__lock-hint">Stop this virtual machine to change its network mode.</p>}
      <div className="vmdetails__cards">
        {NETWORK_MODES.map((n) => (
          <button key={n.id} type="button" disabled={!stopped || saving} className={["vmdetails__card", mode === n.id ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={() => void save(n.id)}>
            <span className="vmdetails__card-title">{n.label}</span>
            <span className="vmdetails__card-hint">{n.description}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// -- Snapshots ------------------------------------------------------------------

function SnapshotsTab({ vm, onChanged }: { vm: VmSummary; onChanged: () => void }) {
  const toast = useToast();
  const stopped = vm.status === "stopped";
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ kind: "restore" | "delete"; snapshot: SnapshotInfo } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => void listSnapshots(vm.id).then(setSnapshots).catch(() => setSnapshots([]));
  useEffect(reload, [vm.id]);

  const submitCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createSnapshot(vm.id, name.trim(), description.trim() || null);
      toast.success(`Snapshot "${name.trim()}" created`);
      setCreating(false);
      setName("");
      setDescription("");
      reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "restore") {
        await restoreSnapshot(vm.id, pending.snapshot.id);
        toast.success(`Restored "${pending.snapshot.name}"`);
      } else {
        await deleteSnapshot(vm.id, pending.snapshot.id);
        toast.success(`Deleted "${pending.snapshot.name}"`);
      }
      setPending(null);
      reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="vmdetails__actions-row">
        <Button size="sm" variant="primary" icon={<CameraIcon size={13} />} disabled={!stopped} onClick={() => setCreating(true)}>
          Create Snapshot
        </Button>
        {!stopped && <span className="vmdetails__lock-hint vmdetails__lock-hint--inline">Stop the VM to manage snapshots.</span>}
      </div>

      {snapshots === null ? (
        <p className="vmdetails__loading">Loading…</p>
      ) : snapshots.length === 0 ? (
        <EmptyState inset title="No snapshots yet" description="Create one before making a risky change - you can restore back to this point anytime." />
      ) : (
        <Card flush>
          <ul className="vmdetails__snap-list">
            {snapshots.map((s) => (
              <li key={s.id} className="vmdetails__snap-row">
                <div className="vmdetails__snap-main">
                  <p className="vmdetails__snap-name">{s.name}</p>
                  <p className="vmdetails__snap-meta">
                    {formatDateTime(s.createdAt)}
                    {s.description ? ` · ${s.description}` : ""}
                  </p>
                </div>
                <div className="vmdetails__snap-actions">
                  <Button size="sm" variant="secondary" disabled={!stopped} onClick={() => setPending({ kind: "restore", snapshot: s })}>
                    Restore
                  </Button>
                  <Button size="sm" variant="danger" disabled={!stopped} onClick={() => setPending({ kind: "delete", snapshot: s })}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create Snapshot"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submitCreate()} loading={saving} disabled={!name.trim()}>
              Create Snapshot
            </Button>
          </>
        }
      >
        <div className="stack stack--sm">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Before tooling setup" autoFocus />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={pending != null}
        onClose={() => setPending(null)}
        onConfirm={confirmAction}
        busy={busy}
        danger={pending?.kind === "delete"}
        title={pending?.kind === "restore" ? "Restore snapshot" : "Delete snapshot"}
        confirmLabel={pending?.kind === "restore" ? "Restore" : "Delete"}
        message={
          pending?.kind === "restore"
            ? `This replaces the current disk state with "${pending.snapshot.name}". Anything changed since this snapshot will be lost.`
            : `This permanently deletes the snapshot "${pending?.snapshot.name}". This cannot be undone.`
        }
      />
    </div>
  );
}

// -- Advanced -------------------------------------------------------------------

function AdvancedTab({ vm }: { vm: VmSummary }) {
  return (
    <Card>
      <div className="vmdetails__rows">
        <div className="vmdetails__row">
          <span>VM ID</span>
          <span className="mono selectable">{vm.id}</span>
        </div>
        <div className="vmdetails__row">
          <span>Created</span>
          <span className="mono">{formatDateTime(vm.createdAt)}</span>
        </div>
        <div className="vmdetails__row">
          <span>ISO</span>
          <span className="mono selectable">{vm.isoPath ?? "None"}</span>
        </div>
        <div className="vmdetails__row">
          <span>VM folder</span>
          <span className="mono selectable">{vm.folder}</span>
        </div>
      </div>
      <div className="vmdetails__actions-row">
        <Button size="sm" variant="secondary" onClick={() => void revealPath(vm.folder)}>
          Open VM Folder
        </Button>
      </div>
    </Card>
  );
}
