import type { UnlockResult } from "@/types";
import { invoke } from "./ipc";

export const hasPassword = (): Promise<boolean> => invoke<boolean>("has_password");

export const createPassword = (password: string): Promise<void> => invoke<void>("create_password", { password });

/** A wrong guess or an active cooldown both come back as `{ok:false, ...}`,
 * never a thrown error - only a genuinely exceptional case throws. */
export const verifyPassword = (password: string): Promise<UnlockResult> => invoke<UnlockResult>("verify_password", { password });

export const changePassword = (current: string, newPassword: string): Promise<void> =>
  invoke<void>("change_password", { current, newPassword });

export const disablePassword = (current: string): Promise<void> => invoke<void>("disable_password", { current });

/** Seconds remaining on an already-active cooldown, or `null` - lets the
 * lock screen show a live countdown on mount rather than only learning
 * about a cooldown after a wasted submit. */
export const lockStatus = (): Promise<number | null> => invoke<number | null>("lock_status");
