import type { Settings, WindowGeometry } from "@/types";
import { invoke } from "./ipc";

export const getSettings = (): Promise<Settings> => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings): Promise<Settings> => invoke<Settings>("save_settings", { settings });
export const resetSettings = (): Promise<Settings> => invoke<Settings>("reset_settings");
export const saveWindowGeometry = (geometry: WindowGeometry): Promise<void> => invoke<void>("save_window_geometry", { geometry });
