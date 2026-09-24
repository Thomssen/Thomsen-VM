/**
 * Mock backend used only when the UI runs outside Tauri (`npm run dev` in a
 * plain browser, for fast design iteration). Never used in the real app -
 * `services/ipc.ts` only reaches here when `isTauri()` is false. Data here is
 * illustrative sample data for design work, not something a real build ships.
 */

import type {
  AppInfo,
  AutomaticHardware,
  CreateVmInput,
  DetectedIso,
  HostFacts,
  LiveUsage,
  ProviderAvailability,
  Settings,
  SnapshotInfo,
  StorageInfo,
  UnlockResult,
  UpdateVmInput,
  VmLiveStats,
  VmSummary,
  WindowGeometry,
} from "@/types";

let settings: Settings = {
  username: "Thomsen",
  theme: "dark",
  windowStyle: "macos",
  onboardingCompleted: true,
  requireLoginOnStartup: true,
  startWithWindows: false,
  rememberWindowPosition: true,
  checkForUpdates: true,
  confirmBeforeDeleteVms: true,
  defaultVmFolder: null,
  defaultCpuCores: 2,
  defaultRamMb: 2048,
  defaultDiskGb: 40,
  defaultNetworkMode: "nat",
  windowGeometry: null,
  vmMonitor: null,
  scalingMode: "fit",
  keepAspectRatio: true,
  autoResizeGuest: true,
  rememberFullscreen: true,
  lastFullscreen: false,
};

/** Simplified in-memory stand-in for the real Argon2id/Credential Manager
 * flow - this file is illustrative design-preview data only, never used in
 * a real build (see the module doc comment above). */
let mockPasswordPlain: string | null = null;

let vms: VmSummary[] = [
  {
    id: "vm-1",
    name: "Kali Lab",
    osFamily: "linux",
    osPreset: "kali-linux",
    isoPath: "C:\\Users\\Thomsen\\Downloads\\kali-linux-2024.4-installer-amd64.iso",
    isoName: "kali-linux-2024.4-installer-amd64.iso",
    cpuCores: 4,
    ramMb: 4096,
    diskGb: 50,
    networkMode: "nat",
    firmware: "uefi",
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    lastStartedAt: new Date(Date.now() - 3600_000).toISOString(),
    status: "running",
    diskUsedMb: 18_400,
    folder: "C:\\Users\\Thomsen\\Documents\\Thomsen VM\\VirtualMachines\\Kali-Lab-a1b2c3d4",
  },
  {
    id: "vm-2",
    name: "Ubuntu Desktop",
    osFamily: "linux",
    osPreset: "ubuntu",
    isoPath: "C:\\Users\\Thomsen\\Downloads\\ubuntu-24.04.1-desktop-amd64.iso",
    isoName: "ubuntu-24.04.1-desktop-amd64.iso",
    cpuCores: 2,
    ramMb: 4096,
    diskGb: 25,
    networkMode: "nat",
    firmware: "bios",
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    lastStartedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    status: "stopped",
    diskUsedMb: 9_800,
    folder: "C:\\Users\\Thomsen\\Documents\\Thomsen VM\\VirtualMachines\\Ubuntu-Desktop-e5f6a7b8",
  },
  {
    id: "vm-3",
    name: "Windows 11 Test",
    osFamily: "windows",
    osPreset: "windows-11",
    isoPath: "C:\\ISOs\\Win11_24H2_English_x64.iso",
    isoName: "Win11_24H2_English_x64.iso",
    cpuCores: 4,
    ramMb: 8192,
    diskGb: 64,
    networkMode: "nat",
    firmware: "uefi",
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    lastStartedAt: null,
    status: "stopped",
    diskUsedMb: 22_000,
    folder: "C:\\Users\\Thomsen\\Documents\\Thomsen VM\\VirtualMachines\\Windows-11-Test-c9d0e1f2",
  },
];

const snapshots: Record<string, SnapshotInfo[]> = {
  "vm-1": [
    { id: "snap-1", name: "Fresh install", createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), description: "Clean Kali install before tooling setup." },
    { id: "snap-2", name: "Tools configured", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), description: null },
  ],
};

function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

function findVm(id: string): VmSummary {
  const vm = vms.find((v) => v.id === id);
  if (!vm) throw { message: "That virtual machine no longer exists." };
  return vm;
}

let idCounter = 100;

export async function mockBackend<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "app_info":
      return delay({
        name: "Thomsen VM",
        version: "0.1.0",
        dataDir: "C:\\Users\\Thomsen\\AppData\\Roaming\\Thomsen VM",
        logsPath: "C:\\Users\\Thomsen\\AppData\\Roaming\\Thomsen VM\\logs\\thomsen-vm.log",
        loadWarnings: [],
      } satisfies AppInfo as T);

    case "get_host_facts":
      return delay({
        username: "Thomsen",
        computerName: "THOMSEN-PC",
        cpuName: "AMD Ryzen 7 7800X3D 8-Core Processor",
        cpuCoresPhysical: 8,
        cpuCoresLogical: 16,
        ramTotalMb: 32768,
        gpuName: "NVIDIA GeForce RTX 4070",
        windowsVersion: "Windows 11 Pro 24H2 (Build 26200)",
        virtualizationFirmwareEnabled: true,
        hypervPresent: false,
        hypervRunning: false,
      } satisfies HostFacts as T);

    case "get_live_usage": {
      const running = vms.some((v) => v.status === "running");
      return delay({ cpuPercent: running ? 24 + Math.random() * 18 : 6 + Math.random() * 6, ramUsedMb: running ? 14200 : 9800, ramTotalMb: 32768 } satisfies LiveUsage as T);
    }

    case "get_storage_info":
      return delay({ drive: "C:\\", totalGb: 953, availableGb: 341.7 } satisfies StorageInfo as T);

    case "qemu_status":
    case "recheck_qemu":
      return delay({ backendName: "QEMU", available: true, version: "9.1.0", reason: null, suggestedFix: null } satisfies ProviderAvailability as T);

    case "open_logs_folder":
      return delay("C:\\Users\\Thomsen\\AppData\\Roaming\\Thomsen VM\\logs" as T);

    case "default_vm_folder_path":
      return delay("C:\\Users\\Thomsen\\Documents\\Thomsen VM\\VirtualMachines" as T);

    case "get_settings":
      return delay(settings as T);

    case "save_settings":
      settings = args?.settings as Settings;
      return delay(settings as T);

    case "reset_settings":
      settings = {
        username: "",
        theme: "dark",
        windowStyle: "macos",
        onboardingCompleted: false,
        requireLoginOnStartup: true,
        startWithWindows: false,
        rememberWindowPosition: true,
        checkForUpdates: true,
        confirmBeforeDeleteVms: true,
        defaultVmFolder: null,
        defaultCpuCores: 2,
        defaultRamMb: 2048,
        defaultDiskGb: 40,
        defaultNetworkMode: "nat",
        windowGeometry: null,
        vmMonitor: null,
        scalingMode: "fit",
        keepAspectRatio: true,
        autoResizeGuest: true,
        rememberFullscreen: true,
        lastFullscreen: false,
      };
      return delay(settings as T);

    case "save_window_geometry":
      settings = { ...settings, windowGeometry: args?.geometry as WindowGeometry };
      return delay(undefined as T);

    case "has_password":
      return delay((mockPasswordPlain !== null) as T);

    case "create_password":
      mockPasswordPlain = args?.password as string;
      return delay(undefined as T, 400);

    case "verify_password": {
      const ok = mockPasswordPlain !== null && args?.password === mockPasswordPlain;
      return delay({ ok, message: ok ? "" : "Incorrect password.", retryAfterSecs: null } satisfies UnlockResult as T, 400);
    }

    case "change_password":
      if (mockPasswordPlain !== null && args?.current !== mockPasswordPlain) {
        return Promise.reject({ message: "Incorrect password." });
      }
      mockPasswordPlain = args?.newPassword as string;
      return delay(undefined as T, 400);

    case "disable_password":
      if (mockPasswordPlain !== null && args?.current !== mockPasswordPlain) {
        return Promise.reject({ message: "Incorrect password." });
      }
      mockPasswordPlain = null;
      return delay(undefined as T, 400);

    case "lock_status":
      return delay(null as T);

    case "list_vms":
      return delay([...vms] as T);

    case "get_vm":
      return delay(findVm(args?.id as string) as T);

    case "create_vm": {
      const input = args?.input as CreateVmInput;
      const vm: VmSummary = {
        id: `vm-${idCounter++}`,
        name: input.name,
        osFamily: input.osFamily,
        osPreset: input.osPreset,
        isoPath: input.isoPath,
        isoName: input.isoPath ? input.isoPath.split(/[\\/]/).pop() ?? null : null,
        cpuCores: input.cpuCores,
        ramMb: input.ramMb,
        diskGb: input.diskGb,
        networkMode: input.networkMode,
        firmware: input.firmware,
        createdAt: new Date().toISOString(),
        lastStartedAt: null,
        status: "stopped",
        diskUsedMb: 40,
        folder: `C:\\Users\\Thomsen\\Documents\\Thomsen VM\\VirtualMachines\\${input.name.replace(/[^a-zA-Z0-9]+/g, "-")}`,
      };
      vms = [vm, ...vms];
      return delay(vm as T, 500);
    }

    case "start_vm": {
      const vm = findVm(args?.id as string);
      vm.status = "running";
      vm.lastStartedAt = new Date().toISOString();
      return delay(undefined as T, 700);
    }

    case "stop_vm": {
      const vm = findVm(args?.id as string);
      vm.status = "stopped";
      return delay(undefined as T, 400);
    }

    case "pause_vm": {
      const vm = findVm(args?.id as string);
      vm.status = "paused";
      return delay(undefined as T);
    }

    case "resume_vm": {
      const vm = findVm(args?.id as string);
      vm.status = "running";
      return delay(undefined as T);
    }

    case "restart_vm":
    case "send_ctrl_alt_del":
      return delay(undefined as T, 300);

    case "vm_live_stats": {
      const vm = findVm(args?.id as string);
      if (vm.status !== "running") return delay(null as T);
      return delay({ cpuPercent: 18 + Math.random() * 22, ramUsedMb: Math.round(vm.ramMb * 0.7), diskReadBytesPerSec: 120_000, diskWriteBytesPerSec: 65_000, networkAvailable: false } satisfies VmLiveStats as T);
    }

    case "vm_display_info": {
      // No real QEMU/VNC process exists in the browser-only preview - the
      // real display transport can only be exercised inside Tauri. VmDisplay
      // treats `null` as "no display to show" regardless of run status.
      return delay(null as T);
    }

    case "delete_vm":
      vms = vms.filter((v) => v.id !== args?.id);
      return delay(undefined as T);

    case "update_vm": {
      const vm = findVm(args?.id as string);
      const patch = args?.patch as UpdateVmInput;
      Object.assign(vm, patch);
      return delay(vm as T);
    }

    case "list_snapshots":
      return delay((snapshots[args?.id as string] ?? []) as T);

    case "create_snapshot": {
      const id = args?.id as string;
      const snap: SnapshotInfo = { id: `snap-${idCounter++}`, name: args?.name as string, createdAt: new Date().toISOString(), description: (args?.description as string) ?? null };
      snapshots[id] = [snap, ...(snapshots[id] ?? [])];
      return delay(snap as T, 500);
    }

    case "restore_snapshot":
    case "delete_snapshot":
      return delay(undefined as T, 400);

    case "automatic_hardware": {
      const cpu = Math.min((args?.presetCpu as number) ?? 2, 12);
      const ram = Math.min((args?.presetRamMb as number) ?? 2048, 24576);
      return delay({ cpuCores: cpu, ramMb: ram, maxCpuCores: 12, maxRamMb: 24576 } satisfies AutomaticHardware as T);
    }

    case "detect_iso": {
      const path = (args?.path as string) ?? "";
      const fileName = path.split(/[\\/]/).pop() ?? "selected.iso";
      const lower = fileName.toLowerCase();
      const guess = lower.includes("kali")
        ? { osFamilyGuess: "linux" as const, presetGuess: "kali-linux" as const }
        : lower.includes("ubuntu")
          ? { osFamilyGuess: "linux" as const, presetGuess: "ubuntu" as const }
          : lower.includes("win11") || lower.includes("windows11")
            ? { osFamilyGuess: "windows" as const, presetGuess: "windows-11" as const }
            : { osFamilyGuess: null, presetGuess: null };
      return delay({ fileName, sizeBytes: 4_700_000_000, labelGuess: null, ...guess } satisfies DetectedIso as T);
    }

    default:
      return Promise.reject({ message: `Mock backend: no handler for "${command}".` });
  }
}
