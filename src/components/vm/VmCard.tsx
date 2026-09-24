import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { PlayIcon, StopIcon, TerminalIcon } from "@/components/icons";
import { formatMb } from "@/lib/format";
import { relativeTime } from "@/lib/format";
import { presetById } from "@/config/presets";
import type { VmSummary } from "@/types";
import "./VmCard.css";

const STATUS_TONE = { running: "good", starting: "good", paused: "warn", stopping: "neutral", stopped: "neutral" } as const;
const STATUS_LABEL: Record<VmSummary["status"], string> = { running: "Running", starting: "Starting…", paused: "Paused", stopping: "Stopping…", stopped: "Stopped" };

interface VmCardProps {
  vm: VmSummary;
  busy?: boolean;
  onOpen: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenConsole: () => void;
  onDelete: () => void;
}

export function VmCard({ vm, busy, onOpen, onStart, onStop, onRestart, onOpenConsole, onDelete }: VmCardProps) {
  const osLabel = presetById(vm.osPreset ?? undefined)?.label ?? (vm.osFamily === "windows" ? "Windows" : vm.osFamily === "linux" ? "Linux" : "Other");
  const running = vm.status === "running" || vm.status === "paused";
  const stopped = vm.status === "stopped";

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStop();
  };
  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStart();
  };
  const console_ = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenConsole();
  };

  const menuItems: MenuItem[] = [
    { label: "Restart", onSelect: onRestart, disabled: !running },
    { label: "Settings", onSelect: onOpen },
    { label: "Delete", onSelect: onDelete, danger: true, disabled: !stopped },
  ];

  return (
    <Card interactive className="vm-card" onClick={onOpen}>
      <div className="vm-card__head">
        <div className="vm-card__title-wrap">
          <h3 className="vm-card__name">{vm.name}</h3>
          <p className="vm-card__os">{osLabel}</p>
        </div>
        <Badge tone={STATUS_TONE[vm.status]}>{STATUS_LABEL[vm.status]}</Badge>
      </div>

      <div className="vm-card__stats">
        <div>
          <span className="vm-card__stat-label">RAM</span>
          <span className="vm-card__stat-value">{formatMb(vm.ramMb)}</span>
        </div>
        <div>
          <span className="vm-card__stat-label">CPU</span>
          <span className="vm-card__stat-value">{vm.cpuCores} cores</span>
        </div>
        <div>
          <span className="vm-card__stat-label">Disk</span>
          <span className="vm-card__stat-value">{vm.diskGb} GB</span>
        </div>
        <div>
          <span className="vm-card__stat-label">Last started</span>
          <span className="vm-card__stat-value">{relativeTime(vm.lastStartedAt)}</span>
        </div>
      </div>

      <div className="vm-card__actions">
        {stopped ? (
          <Button size="sm" variant="primary" icon={<PlayIcon size={13} />} onClick={start} loading={busy}>
            Start
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<StopIcon size={12} />} onClick={stop} loading={busy}>
            Stop
          </Button>
        )}
        {running && (
          <Button size="sm" variant="secondary" icon={<TerminalIcon size={14} />} onClick={console_}>
            Console
          </Button>
        )}
        <div className="vm-card__spacer" />
        <div onClick={(e) => e.stopPropagation()}>
          <Menu items={menuItems} />
        </div>
      </div>
    </Card>
  );
}
