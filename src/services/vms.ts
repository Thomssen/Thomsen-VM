import type { AutomaticHardware, CreateVmInput, DetectedIso, SnapshotInfo, UpdateVmInput, VmDisplayInfo, VmLiveStats, VmSummary } from "@/types";
import { invoke } from "./ipc";

export const listVms = (): Promise<VmSummary[]> => invoke<VmSummary[]>("list_vms");
export const getVm = (id: string): Promise<VmSummary> => invoke<VmSummary>("get_vm", { id });
export const createVm = (input: CreateVmInput): Promise<VmSummary> => invoke<VmSummary>("create_vm", { input });
export const updateVm = (id: string, patch: UpdateVmInput): Promise<VmSummary> => invoke<VmSummary>("update_vm", { id, patch });
export const deleteVm = (id: string): Promise<void> => invoke<void>("delete_vm", { id });

export const startVm = (id: string): Promise<void> => invoke<void>("start_vm", { id });
export const stopVm = (id: string, force = false): Promise<void> => invoke<void>("stop_vm", { id, force });
export const pauseVm = (id: string): Promise<void> => invoke<void>("pause_vm", { id });
export const resumeVm = (id: string): Promise<void> => invoke<void>("resume_vm", { id });
export const restartVm = (id: string): Promise<void> => invoke<void>("restart_vm", { id });
export const sendCtrlAltDel = (id: string): Promise<void> => invoke<void>("send_ctrl_alt_del", { id });
export const getVmLiveStats = (id: string): Promise<VmLiveStats | null> => invoke<VmLiveStats | null>("vm_live_stats", { id });
export const getVmDisplayInfo = (id: string): Promise<VmDisplayInfo | null> => invoke<VmDisplayInfo | null>("vm_display_info", { id });

export const listSnapshots = (id: string): Promise<SnapshotInfo[]> => invoke<SnapshotInfo[]>("list_snapshots", { id });
export const createSnapshot = (id: string, name: string, description: string | null): Promise<SnapshotInfo> =>
  invoke<SnapshotInfo>("create_snapshot", { id, name, description });
export const restoreSnapshot = (id: string, snapshotId: string): Promise<void> => invoke<void>("restore_snapshot", { id, snapshotId });
export const deleteSnapshot = (id: string, snapshotId: string): Promise<void> => invoke<void>("delete_snapshot", { id, snapshotId });

export const getAutomaticHardware = (presetCpu: number, presetRamMb: number): Promise<AutomaticHardware> =>
  invoke<AutomaticHardware>("automatic_hardware", { presetCpu, presetRamMb });
export const detectIso = (path: string): Promise<DetectedIso> => invoke<DetectedIso>("detect_iso", { path });
