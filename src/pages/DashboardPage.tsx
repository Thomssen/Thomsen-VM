import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlusIcon } from "@/components/icons";
import { useNavigation } from "@/state/NavigationProvider";
import { useSettings } from "@/state/SettingsProvider";
import { getHostFacts, getLiveUsage, getQemuStatus, getStorageInfo } from "@/services/system";
import { listVms } from "@/services/vms";
import { capitalize, formatGb, formatMb, formatPercent, relativeTime, timeGreeting } from "@/lib/format";
import type { HostFacts, LiveUsage, ProviderAvailability, StorageInfo, VmSummary } from "@/types";
import "./DashboardPage.css";

const LIVE_POLL_MS = 2500;

export function DashboardPage() {
  const { navigate, openVmDetails } = useNavigation();
  const { settings } = useSettings();

  const [host, setHost] = useState<HostFacts | null>(null);
  const [usage, setUsage] = useState<LiveUsage | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [qemu, setQemu] = useState<ProviderAvailability | null>(null);
  const [vms, setVms] = useState<VmSummary[] | null>(null);

  useEffect(() => {
    void getHostFacts().then(setHost).catch(() => {});
    void getStorageInfo().then(setStorage).catch(() => {});
    void getQemuStatus().then(setQemu).catch(() => {});
  }, []);

  // Polled separately from the mostly-static host facts above: a VM's
  // status can change on its own (crash, or an abruptly-closed app leaving
  // it orphaned), and this page would otherwise never notice.
  useEffect(() => {
    const reload = () => void listVms().then(setVms).catch(() => {});
    reload();
    const id = window.setInterval(reload, 2000);
    return () => window.clearInterval(id);
  }, []);

  // Cheap live numbers only, polled while this page is mounted - stopped the
  // instant the user navigates away.
  useEffect(() => {
    let cancelled = false;
    const tick = () => void getLiveUsage().then((u) => !cancelled && setUsage(u)).catch(() => {});
    tick();
    const id = window.setInterval(tick, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const running = useMemo(() => (vms ?? []).filter((v) => v.status === "running" || v.status === "paused").length, [vms]);
  const recent = useMemo(
    () =>
      [...(vms ?? [])]
        .sort((a, b) => new Date(b.lastStartedAt ?? b.createdAt).getTime() - new Date(a.lastStartedAt ?? a.createdAt).getTime())
        .slice(0, 6),
    [vms],
  );

  const virtualizationTone = host?.virtualizationFirmwareEnabled === true ? "good" : host?.virtualizationFirmwareEnabled === false ? "bad" : "neutral";
  const virtualizationLabel = host?.virtualizationFirmwareEnabled === true ? "Enabled" : host?.virtualizationFirmwareEnabled === false ? "Disabled" : "Unknown";

  return (
    <Page
      title={`${timeGreeting()}, ${settings.username || "there"}`}
      eyebrow={host ? `On ${host.computerName}` : "Overview"}
      actions={
        <Button variant="primary" size="lg" icon={<PlusIcon size={18} />} onClick={() => navigate("create-vm")}>
          Create Virtual Machine
        </Button>
      }
    >
      <div className="stack">
        <div className="dash__stats">
          <StatTile label="Virtual Machines" value={vms ? vms.length : "—"} onClick={() => navigate("vms")} />
          <StatTile label="Running" value={vms ? running : "—"} note={vms && running > 0 ? "tap to view" : undefined} onClick={() => navigate("vms")} />
          <StatTile label="CPU Usage" value={formatPercent(usage?.cpuPercent)} />
          <StatTile label="RAM Available" value={usage ? formatMb(usage.ramTotalMb - usage.ramUsedMb) : "—"} note={usage ? `of ${formatMb(usage.ramTotalMb)}` : undefined} />
          <StatTile label="Storage Available" value={storage ? formatGb(storage.availableGb) : "—"} note={storage ? `on ${storage.drive}` : undefined} onClick={() => navigate("system")} />
          <StatTile
            label="Virtualization"
            value={<Badge tone={virtualizationTone} dot={false}>{virtualizationLabel}</Badge>}
            onClick={() => navigate("system")}
          />
        </div>

        {qemu && !qemu.available && (
          <Card className="dash__qemu-warning">
            <p className="dash__qemu-title">QEMU is not installed</p>
            <p className="dash__qemu-hint">{qemu.suggestedFix ?? "Install QEMU for Windows to create and run virtual machines."}</p>
          </Card>
        )}

        <Card>
          <div className="dash__card-head">
            <h3>Recent virtual machines</h3>
            <button type="button" onClick={() => navigate("vms")}>
              View all
            </button>
          </div>
          {vms === null ? (
            <p className="dash__loading">Loading…</p>
          ) : recent.length === 0 ? (
            <EmptyState
              inset
              title="No virtual machines yet"
              description="Create your first virtual machine to get started - Thomsen VM will recommend sensible hardware for you."
              action={
                <Button size="sm" variant="secondary" onClick={() => navigate("create-vm")}>
                  Create Virtual Machine
                </Button>
              }
            />
          ) : (
            <ul className="dash__list">
              {recent.map((vm) => (
                <li key={vm.id}>
                  <button type="button" onClick={() => openVmDetails(vm.id)}>
                    <span className="dash__vm-name">{vm.name}</span>
                    <span className="dash__vm-meta">
                      {vm.cpuCores} cores · {formatMb(vm.ramMb)} · last started {relativeTime(vm.lastStartedAt)}
                    </span>
                    <Badge tone={vm.status === "running" ? "good" : vm.status === "paused" ? "warn" : "neutral"}>{capitalize(vm.status)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
