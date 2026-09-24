import { useEffect, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CameraIcon } from "@/components/icons";
import { useNavigation } from "@/state/NavigationProvider";
import { listVms, listSnapshots, restoreSnapshot, deleteSnapshot } from "@/services/vms";
import { errorMessage } from "@/services/ipc";
import { formatDateTime } from "@/lib/format";
import type { SnapshotInfo, VmSummary } from "@/types";
import "./SnapshotsPage.css";

interface Row {
  vm: VmSummary;
  snapshot: SnapshotInfo;
}

type PendingAction = { kind: "restore" | "delete"; row: Row };

export function SnapshotsPage() {
  const { openVmDetails, navigate } = useNavigation();
  const toast = useToast();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const vms = await listVms();
    const perVm = await Promise.all(vms.map(async (vm) => (await listSnapshots(vm.id)).map((snapshot) => ({ vm, snapshot }))));
    const all = perVm.flat().sort((a, b) => new Date(b.snapshot.createdAt).getTime() - new Date(a.snapshot.createdAt).getTime());
    setRows(all);
  };

  useEffect(() => {
    void reload().catch(() => setRows([]));
  }, []);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "restore") {
        await restoreSnapshot(pending.row.vm.id, pending.row.snapshot.id);
        toast.success(`Restored "${pending.row.snapshot.name}"`);
      } else {
        await deleteSnapshot(pending.row.vm.id, pending.row.snapshot.id);
        toast.success(`Deleted "${pending.row.snapshot.name}"`);
      }
      setPending(null);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Snapshots" eyebrow="Point-in-time backups" description="Every snapshot across every virtual machine. Restoring or deleting one cannot be undone.">
      {rows === null ? (
        <p className="snapshots-page__loading">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No snapshots yet"
          description="Open a virtual machine's Snapshots tab to create one - useful right before trying something you might want to undo."
          action={
            <Button variant="secondary" onClick={() => navigate("vms")}>
              Go to Virtual Machines
            </Button>
          }
        />
      ) : (
        <Card flush>
          <ul className="snapshots-list">
            {rows.map(({ vm, snapshot }) => (
              <li key={snapshot.id} className="snapshots-list__row">
                <CameraIcon size={16} className="snapshots-list__icon" />
                <div className="snapshots-list__main">
                  <p className="snapshots-list__name">{snapshot.name}</p>
                  <p className="snapshots-list__meta">
                    <button type="button" className="snapshots-list__vm-link" onClick={() => openVmDetails(vm.id)}>
                      {vm.name}
                    </button>
                    {" · "}
                    {formatDateTime(snapshot.createdAt)}
                    {snapshot.description ? ` · ${snapshot.description}` : ""}
                  </p>
                </div>
                <div className="snapshots-list__actions">
                  <Button size="sm" variant="secondary" disabled={vm.status !== "stopped"} onClick={() => setPending({ kind: "restore", row: { vm, snapshot } })}>
                    Restore
                  </Button>
                  <Button size="sm" variant="danger" disabled={vm.status !== "stopped"} onClick={() => setPending({ kind: "delete", row: { vm, snapshot } })}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={pending != null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        busy={busy}
        danger={pending?.kind === "delete"}
        title={pending?.kind === "restore" ? "Restore snapshot" : "Delete snapshot"}
        confirmLabel={pending?.kind === "restore" ? "Restore" : "Delete"}
        message={
          pending?.kind === "restore"
            ? `This replaces "${pending.row.vm.name}"'s current disk state with "${pending.row.snapshot.name}". Anything changed since this snapshot will be lost.`
            : `This permanently deletes the snapshot "${pending?.row.snapshot.name}". This cannot be undone.`
        }
      />
    </Page>
  );
}
