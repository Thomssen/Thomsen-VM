import { useEffect, useState } from "react";
import { Page, Section } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/icons";
import { getHostFacts, getLiveUsage, getQemuStatus, getStorageInfo, recheckQemu } from "@/services/system";
import { formatGb, formatMb } from "@/lib/format";
import type { HostFacts, LiveUsage, ProviderAvailability, StorageInfo } from "@/types";
import "./SystemPage.css";

const MIN_READY_STORAGE_GB = 20;
const MIN_READY_RAM_MB = 2048;

export function SystemPage() {
  const [host, setHost] = useState<HostFacts | null>(null);
  const [usage, setUsage] = useState<LiveUsage | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [qemu, setQemu] = useState<ProviderAvailability | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const load = () => {
    void getHostFacts().then(setHost).catch(() => {});
    void getLiveUsage().then(setUsage).catch(() => {});
    void getStorageInfo().then(setStorage).catch(() => {});
    void getQemuStatus().then(setQemu).catch(() => {});
  };

  useEffect(load, []);

  const doRecheck = async () => {
    setRechecking(true);
    try {
      setQemu(await recheckQemu());
      load();
    } finally {
      setRechecking(false);
    }
  };

  const virtReady = host?.virtualizationFirmwareEnabled === true;
  const memReady = usage != null && usage.ramTotalMb - usage.ramUsedMb >= MIN_READY_RAM_MB;
  const storageReady = storage != null && storage.availableGb >= MIN_READY_STORAGE_GB;
  const hypervisorReady = qemu?.available === true;

  const Readiness = ({ label, ready, unknown }: { label: string; ready: boolean; unknown?: boolean }) => (
    <div className="system-page__readiness-row">
      <span>{label}</span>
      <Badge tone={unknown ? "neutral" : ready ? "good" : "bad"}>{unknown ? "Unknown" : ready ? "Ready" : "Not Ready"}</Badge>
    </div>
  );

  return (
    <Page title="System" eyebrow="This PC" description="Real detection only - nothing here is assumed.">
      <div className="stack">
        <Section title="VM Readiness">
          <Card>
            <div className="system-page__readiness">
              <Readiness label="Virtualization" ready={virtReady} unknown={host?.virtualizationFirmwareEnabled == null} />
              <Readiness label="Memory" ready={memReady} unknown={usage == null} />
              <Readiness label="Storage" ready={storageReady} unknown={storage == null} />
              <Readiness label="Hypervisor" ready={hypervisorReady} unknown={qemu == null} />
            </div>
          </Card>
        </Section>

        <Section title="Processor">
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>CPU</span>
                <span className="mono">{host?.cpuName ?? "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Cores</span>
                <span className="mono">{host ? `${host.cpuCoresPhysical} physical · ${host.cpuCoresLogical} logical` : "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Current usage</span>
                <span className="mono">{usage ? `${Math.round(usage.cpuPercent)}%` : "—"}</span>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Memory">
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>Installed RAM</span>
                <span className="mono">{host ? formatMb(host.ramTotalMb) : "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Available RAM</span>
                <span className="mono">{usage ? formatMb(usage.ramTotalMb - usage.ramUsedMb) : "—"}</span>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Graphics">
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>GPU</span>
                <span className="mono">{host?.gpuName ?? "Not detected"}</span>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Windows">
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>Version</span>
                <span className="mono">{host?.windowsVersion ?? "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Virtualization support</span>
                <Badge tone={virtReady ? "good" : host?.virtualizationFirmwareEnabled === false ? "bad" : "neutral"}>
                  {host?.virtualizationFirmwareEnabled == null ? "Unknown" : virtReady ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="system-page__row">
                <span>Hyper-V</span>
                <Badge tone={host?.hypervRunning ? "warn" : "neutral"}>{host?.hypervRunning ? "Running" : host?.hypervPresent ? "Installed, not running" : "Not installed"}</Badge>
              </div>
            </div>
            {host?.hypervRunning && (
              <p className="system-page__hint">
                Hyper-V is running, which can conflict with QEMU's hardware acceleration. Thomsen VM will automatically fall back to software emulation if needed.
              </p>
            )}
          </Card>
        </Section>

        <Section title="Storage">
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>Drive</span>
                <span className="mono">{storage?.drive ?? "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Total</span>
                <span className="mono">{storage ? formatGb(storage.totalGb) : "—"}</span>
              </div>
              <div className="system-page__row">
                <span>Available</span>
                <span className="mono">{storage ? formatGb(storage.availableGb) : "—"}</span>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Virtualization backend" actions={<Button size="sm" variant="secondary" icon={<RefreshIcon size={13} />} onClick={doRecheck} loading={rechecking}>Recheck</Button>}>
          <Card>
            <div className="system-page__rows">
              <div className="system-page__row">
                <span>Engine</span>
                <span className="mono">{qemu?.backendName ?? "QEMU"}</span>
              </div>
              <div className="system-page__row">
                <span>Status</span>
                <Badge tone={qemu?.available ? "good" : "bad"}>{qemu == null ? "Checking…" : qemu.available ? "Ready" : "Not installed"}</Badge>
              </div>
              {qemu?.version && (
                <div className="system-page__row">
                  <span>Version</span>
                  <span className="mono">{qemu.version}</span>
                </div>
              )}
            </div>
            {qemu && !qemu.available && <p className="system-page__hint">{qemu.suggestedFix}</p>}
          </Card>
        </Section>
      </div>
    </Page>
  );
}
