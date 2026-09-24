import type { AppInfo, HostFacts, LiveUsage, ProviderAvailability, StorageInfo } from "@/types";
import { invoke } from "./ipc";

export const getAppInfo = (): Promise<AppInfo> => invoke<AppInfo>("app_info");

/** CPU model, RAM, GPU, Windows version, virtualization/Hyper-V status - all
 * real detection, safe to call once per page visit rather than on a timer. */
export const getHostFacts = (): Promise<HostFacts> => invoke<HostFacts>("get_host_facts");

/** Live CPU%/RAM - cheap, meant to be polled every few seconds while a page
 * that shows it is visible, and stopped otherwise. */
export const getLiveUsage = (): Promise<LiveUsage> => invoke<LiveUsage>("get_live_usage");

export const getStorageInfo = (): Promise<StorageInfo | null> => invoke<StorageInfo | null>("get_storage_info");

export const getQemuStatus = (): Promise<ProviderAvailability> => invoke<ProviderAvailability>("qemu_status");
export const recheckQemu = (): Promise<ProviderAvailability> => invoke<ProviderAvailability>("recheck_qemu");

export const getLogsFolder = (): Promise<string> => invoke<string>("open_logs_folder");
export const getDefaultVmFolder = (): Promise<string> => invoke<string>("default_vm_folder_path");
