import type { FirmwareMode, NetworkMode, OsFamily, OsPreset, ScalingMode } from "@/types";

export interface OsPresetMeta {
  id: OsPreset;
  label: string;
  family: OsFamily;
  recommended: { cpuCores: number; ramMb: number; diskGb: number };
  note?: string;
}

/**
 * Recommended-settings presets only - Thomsen VM never bundles or downloads
 * any operating system image. The user always supplies their own ISO.
 */
export const OS_PRESETS: readonly OsPresetMeta[] = [
  { id: "kali-linux", label: "Kali Linux", family: "linux", recommended: { cpuCores: 4, ramMb: 4096, diskGb: 50 } },
  { id: "ubuntu", label: "Ubuntu", family: "linux", recommended: { cpuCores: 2, ramMb: 4096, diskGb: 25 } },
  { id: "debian", label: "Debian", family: "linux", recommended: { cpuCores: 2, ramMb: 2048, diskGb: 20 } },
  { id: "arch-linux", label: "Arch Linux", family: "linux", recommended: { cpuCores: 2, ramMb: 2048, diskGb: 20 } },
  {
    id: "windows-11",
    label: "Windows 11",
    family: "windows",
    recommended: { cpuCores: 4, ramMb: 8192, diskGb: 64 },
    note: "The official Windows 11 installer requires UEFI firmware - keep Firmware set to UEFI for this one.",
  },
  { id: "windows-10", label: "Windows 10", family: "windows", recommended: { cpuCores: 2, ramMb: 4096, diskGb: 64 } },
] as const;

export const CUSTOM_RECOMMENDED: Record<OsFamily, { cpuCores: number; ramMb: number; diskGb: number }> = {
  windows: { cpuCores: 2, ramMb: 4096, diskGb: 64 },
  linux: { cpuCores: 2, ramMb: 2048, diskGb: 20 },
  other: { cpuCores: 2, ramMb: 2048, diskGb: 20 },
};

export function presetById(id: OsPreset | null | undefined): OsPresetMeta | undefined {
  return OS_PRESETS.find((p) => p.id === id);
}

export interface NetworkModeMeta {
  id: NetworkMode;
  label: string;
  description: string;
}

export const NETWORK_MODES: readonly NetworkModeMeta[] = [
  { id: "nat", label: "NAT", description: "The VM shares your PC's internet connection through a virtual router. Simple, safe, and works almost everywhere - the default." },
  { id: "bridged", label: "Bridged", description: "The VM appears as its own device on your network. Needs a TAP network adapter installed on this PC." },
  { id: "offline", label: "Offline", description: "No network access at all. The VM is fully isolated from your network and the internet." },
] as const;

export interface ScalingModeMeta {
  id: ScalingMode;
  label: string;
  description: string;
}

export const SCALING_MODES: readonly ScalingModeMeta[] = [
  { id: "fit", label: "Fit", description: "Scales the display to fit the window, keeping proportions - black bars only where needed. The default." },
  { id: "stretch", label: "Stretch", description: "Fills the entire window. May distort the picture unless Keep Aspect Ratio is on." },
  { id: "native", label: "Native", description: "Shows the guest's actual resolution with no scaling - centered, cropped if it's larger than the window." },
] as const;

export interface FirmwareModeMeta {
  id: FirmwareMode;
  label: string;
  description: string;
}

export const FIRMWARE_MODES: readonly FirmwareModeMeta[] = [
  { id: "uefi", label: "UEFI", description: "Modern firmware (real OVMF/EDK2) - required for Windows 11 and recommended for current Linux distributions. The default." },
  { id: "bios", label: "Legacy BIOS", description: "Classic firmware, for older installers or operating systems that expect it." },
] as const;
