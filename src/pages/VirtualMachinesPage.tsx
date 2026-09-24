import { useEffect, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { useToast } from "@/components/ui/Toast";
import { VmCard } from "@/components/vm/VmCard";
import { PlusIcon } from "@/components/icons";
import { useNavigation } from "@/state/NavigationProvider";
import { useSettings } from "@/state/SettingsProvider";
import { deleteVm, listVms, restartVm, startVm, stopVm } from "@/services/vms";
import { openVmConsole } from "@/services/console";
import { asAppError, errorMessage } from "@/services/ipc";
import type { AppErrorShape, VmSummary } from "@/types";
import "./VirtualMachinesPage.css";

export function VirtualMachinesPage() {
  const { navigate, openVmDetails } = useNavigation();
  const { settings } = useSettings();
  const toast = useToast();

  const [vms, setVms] = useState<VmSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VmSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = () => void listVms().then(setVms).catch((e) => setError(asAppError(e)));

  useEffect(() => {
    reload();
  }, []);

  const runAction = async (vm: VmSummary, action: () => Promise<void>) => {
    setBusyId(vm.id);
    setError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (vm: VmSummary) => {
    setDeleting(true);
    try {
      await deleteVm(vm.id);
      toast.success(`"${vm.name}" was deleted`);
      setPendingDelete(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (vm: VmSummary) => {
    if (settings.confirmBeforeDeleteVms) {
      setPendingDelete(vm);
    } else {
      void doDelete(vm);
    }
  };

  return (
    <Page
      title="Virtual Machines"
      eyebrow="Manage"
      description="Every virtual machine on this PC, with the controls you need day to day."
      actions={
        <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => navigate("create-vm")}>
          Create Virtual Machine
        </Button>
      }
    >
      <div className="stack">
        {error && <ErrorNotice error={error} />}

        {vms === null ? (
          <p className="vms-page__loading">Loading…</p>
        ) : vms.length === 0 ? (
          <EmptyState
            title="No virtual machines yet"
            description="Create your first virtual machine - Thomsen VM will walk you through choosing an OS, an ISO, and sensible hardware."
            action={
              <Button variant="primary" onClick={() => navigate("create-vm")}>
                Create Virtual Machine
              </Button>
            }
          />
        ) : (
          <div className="vms-page__grid">
            {vms.map((vm) => (
              <VmCard
                key={vm.id}
                vm={vm}
                busy={busyId === vm.id}
                onOpen={() => openVmDetails(vm.id)}
                onStart={() => runAction(vm, () => startVm(vm.id))}
                onStop={() => runAction(vm, () => stopVm(vm.id))}
                onRestart={() => runAction(vm, () => restartVm(vm.id))}
                onOpenConsole={() => void openVmConsole(vm.id, vm.name)}
                onDelete={() => requestDelete(vm)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void doDelete(pendingDelete)}
        title="Delete virtual machine"
        danger
        busy={deleting}
        confirmLabel="Delete"
        message={`This permanently deletes "${pendingDelete?.name}", including its virtual disk and any snapshots. This cannot be undone.`}
      />
    </Page>
  );
}
