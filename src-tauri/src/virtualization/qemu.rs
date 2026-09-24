//! QEMU-backed `VirtualMachineProvider`.
//!
//! Thomsen VM never bundles or auto-installs QEMU - it looks for an existing
//! install (PATH, then the default installer location) and reports a plain
//! "not installed" state with a fix suggestion when it can't find one. Real
//! detection only: if QEMU isn't there, VM creation/start honestly fails
//! instead of pretending to work.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;

use sysinfo::{Pid, System};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::store::models::{SnapshotInfo, VmConfig};
use crate::store::paths;
use crate::store::uuid;

use super::qmp::{ctrl_alt_delete_keys, QmpClient};
use super::{ProviderAvailability, VirtualMachineProvider, VmDisplayInfo, VmLiveStats, VmRuntimeStatus};

/// Hides the console window a plain `qemu-img.exe`/`qemu-system-x86_64.exe`
/// child would otherwise flash behind our UI. Defined locally rather than
/// pulling in the `windows-sys` crate for one flag.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct RunningVm {
    child: Child,
    qmp_port: u16,
    /// QEMU's built-in VNC-over-WebSocket listener (`-vnc ...,websocket=`) -
    /// what `VmDisplay.tsx`'s noVNC client connects to. Bound to loopback
    /// only, same as `qmp_port`.
    vnc_ws_port: u16,
    pid: u32,
    status: VmRuntimeStatus,
    sampler: System,
}

pub struct QemuProvider {
    binaries: OnceLock<Option<QemuBinaries>>,
    running: Mutex<HashMap<String, RunningVm>>,
}

#[derive(Clone)]
struct QemuBinaries {
    system_x86_64: PathBuf,
    img: PathBuf,
    version: String,
}

impl Default for QemuProvider {
    fn default() -> Self {
        QemuProvider { binaries: OnceLock::new(), running: Mutex::new(HashMap::new()) }
    }
}

impl QemuProvider {
    /// Re-run detection (e.g. after the user installs QEMU and clicks
    /// "Recheck" in Settings/System, without restarting the app).
    pub fn refresh_detection(&self) {
        let found = detect_binaries();
        // OnceLock has no reset; a fresh provider is cheap, so callers that
        // need a live refresh construct a new QemuProvider and swap it into
        // AppState instead of mutating this one in place.
        let _ = self.binaries.set(found);
    }

    fn binaries(&self) -> Option<&QemuBinaries> {
        self.binaries.get_or_init(detect_binaries).as_ref()
    }

    fn require_binaries(&self) -> AppResult<&QemuBinaries> {
        self.binaries().ok_or_else(|| {
            AppError::with_fix(
                "QEMU is not installed.",
                "Thomsen VM uses QEMU to run virtual machines, and it could not be found on this PC.",
                "Install QEMU for Windows from qemu.org (or via \"winget install qemu\"), then reopen Thomsen VM.",
            )
        })
    }

    async fn take_running(&self, vm_id: &str) -> AppResult<()> {
        let mut map = self.running.lock().await;
        if let Some(mut running) = map.remove(vm_id) {
            let _ = running.child.kill().await;
        }
        Ok(())
    }
}

fn detect_binaries() -> Option<QemuBinaries> {
    let candidates = qemu_search_paths();
    for dir in candidates {
        let system = dir.join("qemu-system-x86_64.exe");
        let img = dir.join("qemu-img.exe");
        if system.exists() && img.exists() {
            if let Some(version) = query_version(&system) {
                return Some(QemuBinaries { system_x86_64: system, img, version });
            }
        }
    }
    // Fall back to PATH lookup (covers a manual PATH install with no fixed folder).
    if let Some(version) = query_version(Path::new("qemu-system-x86_64.exe")) {
        return Some(QemuBinaries {
            system_x86_64: PathBuf::from("qemu-system-x86_64.exe"),
            img: PathBuf::from("qemu-img.exe"),
            version,
        });
    }
    None
}

fn qemu_search_paths() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for env_var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(base) = std::env::var(env_var) {
            dirs.push(PathBuf::from(base).join("qemu"));
        }
    }
    dirs
}

fn query_version(exe: &Path) -> Option<String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.arg("--version").stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    // First line looks like: "QEMU emulator version 9.1.0"
    let first_line = text.lines().next().unwrap_or("").trim();
    Some(first_line.split("version").nth(1).map(|v| v.trim().to_string()).unwrap_or_else(|| first_line.to_string()))
}

/// Ask the OS for a free TCP port by binding to port 0, reading it back, then
/// releasing it immediately. Small TOCTOU race in principle; acceptable here
/// since QMP binds within milliseconds of this call.
fn pick_free_port() -> AppResult<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::msg("Could not reserve a local port for the virtual machine.").technical(e.to_string()))?;
    Ok(listener.local_addr().unwrap().port())
}

/// Best-effort check that `pid` (read from a VM's `run.lock`, see
/// `vm_run_lock_file`) is still that same VM's QEMU process, not just some
/// unrelated process that happens to have been assigned the same PID since.
/// Process name is the primary signal - cheap, and doesn't need elevated
/// privileges to read. The command-line check narrows it further when it's
/// actually available, but Windows can silently return an empty command
/// line without administrator rights, so an empty result is treated as
/// "can't tell" rather than "doesn't match".
fn is_still_this_vm(pid: u32, vm_name: &str) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    let Some(process) = sys.process(Pid::from_u32(pid)) else {
        return false;
    };
    if !process.name().to_string_lossy().to_lowercase().contains("qemu-system") {
        return false;
    }
    let cmd = process.cmd();
    cmd.is_empty() || cmd.iter().any(|arg| arg.to_string_lossy() == vm_name)
}

/// Real UEFI firmware, located next to whatever QEMU install `detect_binaries`
/// found - never bundled or downloaded by Thomsen VM itself. `code` is the
/// read-only firmware image (`-drive if=pflash,readonly=on,...`); `vars` is
/// the blank NVRAM-store template each VM gets its own writable copy of (see
/// `ensure_uefi_vars`) - never written to directly.
struct UefiFirmware {
    code: PathBuf,
    vars_template: PathBuf,
}

/// QEMU's official Windows build ships EDK2/OVMF firmware under
/// `share/firmware/*.json` "firmware descriptor" files (the same format
/// libvirt/virt-manager use for auto-discovery) rather than the more
/// familiar `OVMF_CODE.fd`/`OVMF_VARS.fd` names from Linux distro packages.
/// `share/firmware/60-edk2-x86_64.json` names the correct pairing for a
/// plain (non-Secure-Boot) x86_64 UEFI guest: `edk2-x86_64-code.fd` +
/// `edk2-i386-vars.fd` as the NVRAM template - yes, genuinely the
/// `i386`-named vars file; that's QEMU's own packaging, not a typo here.
/// Secure Boot's variant (`edk2-x86_64-secure-code.fd`) additionally
/// requires SMM and a q35 machine type, which is more than "UEFI vs Legacy
/// BIOS" asks for, so this deliberately uses the plain variant.
fn locate_uefi_firmware(bin: &QemuBinaries) -> Option<UefiFirmware> {
    let share = bin.system_x86_64.parent()?.join("share");
    let code = share.join("edk2-x86_64-code.fd");
    let vars_template = share.join("edk2-i386-vars.fd");
    if code.exists() && vars_template.exists() {
        Some(UefiFirmware { code, vars_template })
    } else {
        None
    }
}

fn uefi_firmware_missing_error() -> AppError {
    AppError::with_fix(
        "UEFI firmware files could not be found.",
        "Thomsen VM looks for OVMF/EDK2 firmware next to the QEMU install (share\\edk2-x86_64-code.fd and share\\edk2-i386-vars.fd) and could not find them.",
        "Reinstall QEMU for Windows from qemu.org, which bundles this firmware, or switch this VM's Firmware setting to Legacy BIOS.",
    )
}

/// Resolves both UEFI pflash arguments a VM needs: the shared, read-only
/// firmware CODE image, and this VM's own writable VARS store - copied from
/// the blank-vars template on first use (idempotent: a VM that already has
/// one just keeps it, which is what makes its UEFI settings persist across
/// restarts). Never modifies the template itself. Returns `(code, vars)`.
fn ensure_uefi_firmware(vm_dir: &Path, bin: &QemuBinaries) -> AppResult<(PathBuf, PathBuf)> {
    let firmware = locate_uefi_firmware(bin).ok_or_else(uefi_firmware_missing_error)?;
    let vars_path = paths::vm_uefi_vars_file(vm_dir);
    if !vars_path.exists() {
        std::fs::copy(&firmware.vars_template, &vars_path)
            .map_err(|e| AppError::msg("Could not set up this VM's UEFI storage.").technical(e.to_string()))?;
    }
    Ok((firmware.code, vars_path))
}

/// Locate a usable TAP-Windows adapter for Bridged networking (installed by
/// the OpenVPN "tap-windows6" driver, among others). Real detection via
/// PowerShell/CIM - not assumed present.
fn find_tap_adapter() -> Option<String> {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*TAP-Windows*' -or $_.InterfaceDescription -like '*TAP-Win*' } | Select-Object -First 1 -ExpandProperty Name)",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

fn network_args(mode: &str) -> AppResult<Vec<String>> {
    match mode {
        "offline" => Ok(vec!["-nic".into(), "none".into()]),
        "bridged" => match find_tap_adapter() {
            Some(name) => Ok(vec!["-netdev".into(), format!("tap,id=net0,ifname={name}"), "-device".into(), "virtio-net-pci,netdev=net0".into()]),
            None => Err(AppError::with_fix(
                "Bridged networking isn't available.",
                "Bridged mode needs a TAP-Windows network adapter, and none was found on this PC.",
                "Install the TAP-Windows driver (bundled with OpenVPN) for a real bridged adapter, or switch this VM to NAT in its Network settings.",
            )),
        },
        _ => Ok(vec!["-netdev".into(), "user,id=net0".into(), "-device".into(), "virtio-net-pci,netdev=net0".into()]),
    }
}

impl VirtualMachineProvider for QemuProvider {
    fn availability(&self) -> ProviderAvailability {
        match self.binaries() {
            Some(b) => ProviderAvailability {
                backend_name: "QEMU".into(),
                available: true,
                version: Some(b.version.clone()),
                reason: None,
                suggested_fix: None,
            },
            None => ProviderAvailability {
                backend_name: "QEMU".into(),
                available: false,
                version: None,
                reason: Some("QEMU could not be found on this PC.".into()),
                suggested_fix: Some("Install QEMU for Windows from qemu.org, then reopen Thomsen VM.".into()),
            },
        }
    }

    async fn create_vm(&self, config: &VmConfig, vm_dir: &Path) -> AppResult<()> {
        let bin = self.require_binaries()?;
        let disk_path = paths::vm_disk_file(vm_dir);

        let output = Command::new(&bin.img)
            .args(["create", "-f", "qcow2"])
            .arg(&disk_path)
            .arg(format!("{}G", config.disk_gb))
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|e| AppError::msg("Could not run QEMU's disk-image tool.").technical(e.to_string()))?;

        if !output.status.success() {
            return Err(AppError::with_fix(
                "The virtual disk could not be created.",
                "QEMU's disk-image tool reported an error.",
                "Check that the destination folder is writable and has enough free space, then try again.",
            )
            .technical(String::from_utf8_lossy(&output.stderr).to_string()));
        }

        // Set up this VM's own writable UEFI storage now, at creation time,
        // so a missing-firmware problem surfaces immediately (the command
        // handler deletes the half-formed VM folder on error) rather than
        // only when the user first tries to start it.
        if config.firmware == "uefi" {
            ensure_uefi_firmware(vm_dir, bin)?;
        }
        Ok(())
    }

    async fn start_vm(&self, config: &VmConfig, vm_dir: &Path) -> AppResult<()> {
        let bin = self.require_binaries()?.clone();

        {
            let map = self.running.lock().await;
            if map.contains_key(&config.id) {
                return Err(AppError::msg("This virtual machine is already running."));
            }
        }

        // The in-memory check above only catches a VM this *same* app
        // process already knows about. If a previous session's QEMU child
        // outlived it (e.g. the app was closed/crashed without that Drop
        // running - `kill_on_drop` only fires when the process gets a chance
        // to unwind), this VM would look "Stopped" here but a QEMU process
        // could still be holding its disk open, and starting a second one
        // against the same qcow2 file doesn't fail cleanly - it spawns, runs
        // for a while, then wedges (observed directly: WHPX vCPU execution
        // faults immediately on every resume). A lock file survives across
        // process restarts and catches exactly that case.
        let lock_path = paths::vm_run_lock_file(vm_dir);
        if let Ok(contents) = std::fs::read_to_string(&lock_path) {
            if let Ok(pid) = contents.trim().parse::<u32>() {
                if is_still_this_vm(pid, &config.name) {
                    return Err(AppError::with_fix(
                        "This virtual machine is already running.",
                        "A QEMU process for it is still active from a previous Thomsen VM session.",
                        "Close it from Task Manager (qemu-system-x86_64.exe) if it's stuck, or wait a moment and try again.",
                    ));
                }
            }
        }

        let disk_path = paths::vm_disk_file(vm_dir);
        if !disk_path.exists() {
            return Err(AppError::msg("This VM's disk image is missing.").technical(disk_path.display().to_string()));
        }

        // UEFI firmware - resolved and validated before anything else is
        // allocated, so a missing-firmware problem is always this VM's own
        // clean, pre-flight error (item 8) rather than a QEMU crash or a
        // silent fall-through to BIOS mode.
        let uefi_firmware = if config.firmware == "uefi" { Some(ensure_uefi_firmware(vm_dir, &bin)?) } else { None };

        let qmp_port = pick_free_port()?;
        // A second, independent loopback port for QEMU's own VNC-over-
        // WebSocket listener (see `VmDisplayInfo`'s doc comment) - noVNC
        // connects to this directly, no separate proxy process needed.
        let vnc_ws_port = pick_free_port()?;
        let mut args: Vec<String> = vec![
            "-name".into(),
            config.name.clone(),
            "-m".into(),
            config.ram_mb.to_string(),
            "-smp".into(),
            format!("cores={}", config.cpu_cores.max(1)),
        ];

        if let Some((code, vars)) = &uefi_firmware {
            // Two pflash drives: the shared firmware CODE (read-only - never
            // written to, and never VM-specific) and this VM's own writable
            // VARS store, so its UEFI settings (boot order, Secure Boot
            // state, etc.) genuinely persist across restarts instead of
            // resetting to firmware defaults every boot.
            args.push("-drive".into());
            args.push(format!("if=pflash,format=raw,readonly=on,file={}", code.display()));
            args.push("-drive".into());
            args.push(format!("if=pflash,format=raw,file={}", vars.display()));
        }

        args.extend(vec![
            "-drive".into(),
            format!("file={},if=virtio,format=qcow2", disk_path.display()),
            // virtio-vga is a virtio-gpu device - the one that lets a modern
            // Linux guest's kernel driver actually react to a display resize
            // request (see VmDisplay.tsx's `resizeSession`/"Auto Resize
            // Guest"), not just a cosmetic label.
            "-vga".into(),
            "virtio".into(),
            "-usb".into(),
            "-device".into(),
            "usb-tablet".into(),
            "-audiodev".into(),
            "dsound,id=snd0".into(),
            "-device".into(),
            "ac97,audiodev=snd0".into(),
            "-accel".into(),
            "whpx".into(),
            "-accel".into(),
            "tcg".into(),
            "-qmp".into(),
            format!("tcp:127.0.0.1:{qmp_port},server,nowait"),
            // No local GTK/SDL window - the guest framebuffer is exposed
            // only over VNC-over-WebSocket (loopback-only) for our own
            // Console window to render, never QEMU's own OS window.
            "-display".into(),
            "none".into(),
            "-vnc".into(),
            format!("127.0.0.1:0,to=99,websocket={vnc_ws_port}"),
        ]);

        if let Some(iso) = &config.iso_path {
            if Path::new(iso).exists() {
                args.push("-cdrom".into());
                args.push(iso.clone());
                args.push("-boot".into());
                args.push("order=dc".into());
            }
        }

        args.extend(network_args(&config.network_mode)?);

        let mut command = Command::new(&bin.system_x86_64);
        command.args(&args).kill_on_drop(true).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command
            .spawn()
            .map_err(|e| AppError::with_fix("The virtual machine could not start.", "QEMU failed to launch.", "Check View Details, or try reinstalling QEMU.").technical(e.to_string()))?;

        let pid = child.id().unwrap_or(0);

        // Give QEMU a moment to fail fast (bad args, missing accelerator)
        // before we commit to treating it as running.
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        if let Ok(Some(status)) = child.try_wait() {
            let mut stderr = String::new();
            if let Some(mut out) = child.stderr.take() {
                use tokio::io::AsyncReadExt;
                let _ = out.read_to_string(&mut stderr).await;
            }
            return Err(AppError::with_fix(
                "The virtual machine could not start.",
                "QEMU exited immediately after launching.",
                "Check View Details for QEMU's error output. This often means the configured hardware is invalid or the ISO/disk path is unreadable.",
            )
            .technical(format!("exit status: {status}\n{stderr}")));
        }

        // Best-effort: if this fails, the in-memory check still covers this
        // session, it just wouldn't be caught if a future session started
        // while this process is still alive - not worth failing the start.
        let _ = std::fs::write(&lock_path, pid.to_string());

        let running = RunningVm { child, qmp_port, vnc_ws_port, pid, status: VmRuntimeStatus::Running, sampler: System::new() };
        self.running.lock().await.insert(config.id.clone(), running);
        Ok(())
    }

    async fn stop_vm(&self, vm_id: &str) -> AppResult<()> {
        let port = {
            let mut map = self.running.lock().await;
            let Some(running) = map.get_mut(vm_id) else {
                return Err(AppError::msg("This virtual machine is not running."));
            };
            running.status = VmRuntimeStatus::Stopping;
            running.qmp_port
        };
        let mut qmp = QmpClient::connect(port).await?;
        qmp.execute("system_powerdown", None).await?;
        Ok(())
    }

    async fn kill_vm(&self, vm_id: &str) -> AppResult<()> {
        self.take_running(vm_id).await
    }

    async fn pause_vm(&self, vm_id: &str) -> AppResult<()> {
        let port = self.port_for(vm_id).await?;
        let mut qmp = QmpClient::connect(port).await?;
        qmp.execute("stop", None).await?;
        if let Some(running) = self.running.lock().await.get_mut(vm_id) {
            running.status = VmRuntimeStatus::Paused;
        }
        Ok(())
    }

    async fn resume_vm(&self, vm_id: &str) -> AppResult<()> {
        let port = self.port_for(vm_id).await?;
        let mut qmp = QmpClient::connect(port).await?;
        qmp.execute("cont", None).await?;
        if let Some(running) = self.running.lock().await.get_mut(vm_id) {
            running.status = VmRuntimeStatus::Running;
        }
        Ok(())
    }

    async fn reset_vm(&self, vm_id: &str) -> AppResult<()> {
        let port = self.port_for(vm_id).await?;
        let mut qmp = QmpClient::connect(port).await?;
        qmp.execute("system_reset", None).await?;
        Ok(())
    }

    async fn send_ctrl_alt_del(&self, vm_id: &str) -> AppResult<()> {
        let port = self.port_for(vm_id).await?;
        let mut qmp = QmpClient::connect(port).await?;
        qmp.execute("send-key", Some(ctrl_alt_delete_keys())).await?;
        Ok(())
    }

    async fn status(&self, vm_id: &str) -> VmRuntimeStatus {
        let mut map = self.running.lock().await;
        let Some(running) = map.get_mut(vm_id) else {
            return VmRuntimeStatus::Stopped;
        };
        match running.child.try_wait() {
            Ok(Some(_)) => {
                map.remove(vm_id);
                VmRuntimeStatus::Stopped
            }
            _ => running.status,
        }
    }

    async fn live_stats(&self, vm_id: &str) -> Option<VmLiveStats> {
        let mut map = self.running.lock().await;
        let running = map.get_mut(vm_id)?;
        if running.child.try_wait().ok()?.is_some() {
            return None;
        }
        let pid = Pid::from_u32(running.pid);
        running.sampler.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
        let process = running.sampler.process(pid)?;
        let disk = process.disk_usage();
        Some(VmLiveStats {
            cpu_percent: Some(process.cpu_usage()),
            ram_used_mb: Some(process.memory() / 1024 / 1024),
            disk_read_bytes_per_sec: Some(disk.read_bytes),
            disk_write_bytes_per_sec: Some(disk.written_bytes),
            network_available: false,
        })
    }

    async fn display_info(&self, vm_id: &str) -> Option<VmDisplayInfo> {
        let mut map = self.running.lock().await;
        let running = map.get_mut(vm_id)?;
        if running.child.try_wait().ok()?.is_some() {
            return None;
        }
        Some(VmDisplayInfo { host: "127.0.0.1".into(), ws_port: running.vnc_ws_port })
    }

    async fn create_snapshot(&self, vm_dir: &Path, name: &str, description: Option<String>) -> AppResult<SnapshotInfo> {
        let bin = self.require_binaries()?;
        let disk_path = paths::vm_disk_file(vm_dir);
        let snapshot = SnapshotInfo { id: uuid(), name: name.to_string(), created_at: crate::util::now(), description };

        let output = Command::new(&bin.img)
            .args(["snapshot", "-c"])
            .arg(&snapshot.id)
            .arg(&disk_path)
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|e| AppError::msg("Could not run QEMU's disk-image tool.").technical(e.to_string()))?;

        if !output.status.success() {
            return Err(AppError::with_fix(
                "The snapshot could not be created.",
                "QEMU's disk-image tool reported an error - the VM may still be running.",
                "Stop the virtual machine, then try creating the snapshot again.",
            )
            .technical(String::from_utf8_lossy(&output.stderr).to_string()));
        }

        crate::vms::write_snapshot_meta(vm_dir, &snapshot)?;
        Ok(snapshot)
    }

    async fn restore_snapshot(&self, vm_dir: &Path, snapshot: &SnapshotInfo) -> AppResult<()> {
        let bin = self.require_binaries()?;
        let disk_path = paths::vm_disk_file(vm_dir);
        let output = Command::new(&bin.img)
            .args(["snapshot", "-a"])
            .arg(&snapshot.id)
            .arg(&disk_path)
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|e| AppError::msg("Could not run QEMU's disk-image tool.").technical(e.to_string()))?;

        if !output.status.success() {
            return Err(AppError::with_fix(
                "The snapshot could not be restored.",
                "QEMU's disk-image tool reported an error - the VM may still be running.",
                "Stop the virtual machine, then try restoring the snapshot again.",
            )
            .technical(String::from_utf8_lossy(&output.stderr).to_string()));
        }
        Ok(())
    }

    async fn delete_snapshot(&self, vm_dir: &Path, snapshot: &SnapshotInfo) -> AppResult<()> {
        let bin = self.require_binaries()?;
        let disk_path = paths::vm_disk_file(vm_dir);
        let output = Command::new(&bin.img)
            .args(["snapshot", "-d"])
            .arg(&snapshot.id)
            .arg(&disk_path)
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|e| AppError::msg("Could not run QEMU's disk-image tool.").technical(e.to_string()))?;

        if !output.status.success() {
            return Err(AppError::with_fix(
                "The snapshot could not be deleted.",
                "QEMU's disk-image tool reported an error.",
                "Make sure the virtual machine is stopped, then try again.",
            )
            .technical(String::from_utf8_lossy(&output.stderr).to_string()));
        }
        crate::vms::delete_snapshot_meta(vm_dir, &snapshot.id)?;
        Ok(())
    }
}

impl QemuProvider {
    async fn port_for(&self, vm_id: &str) -> AppResult<u16> {
        let map = self.running.lock().await;
        map.get(vm_id).map(|r| r.qmp_port).ok_or_else(|| AppError::msg("This virtual machine is not running."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::models::VmConfig;

    /// A tiny, disposable VM config (no ISO, offline networking, 1 core /
    /// 128 MB / 1 GB) - enough for QEMU to actually spawn and run against,
    /// cheap enough to boot repeatedly in a test.
    fn tiny_test_config(name: &str) -> VmConfig {
        VmConfig {
            id: crate::store::uuid(),
            name: name.into(),
            os_family: "other".into(),
            os_preset: None,
            iso_path: None,
            iso_name: None,
            cpu_cores: 1,
            ram_mb: 128,
            disk_gb: 1,
            network_mode: "offline".into(),
            firmware: "bios".into(),
            created_at: crate::util::now(),
            last_started_at: None,
        }
    }

    /// End-to-end smoke test against a *real* QEMU install: creates a tiny,
    /// disposable VM and exercises the full lifecycle through the actual
    /// QEMU process and its QMP control socket - the one path that can't be
    /// verified through the mock backend. Skips itself (rather than
    /// failing) when QEMU isn't installed, since it depends on optional
    /// external tooling exactly like the app itself does.
    #[tokio::test]
    async fn full_lifecycle_against_a_real_qemu_process() {
        let provider = QemuProvider::default();
        let availability = provider.availability();
        if !availability.available {
            eprintln!("SKIPPED: QEMU is not installed on this machine ({:?})", availability.reason);
            return;
        }
        println!("Testing against real {} {}", availability.backend_name, availability.version.as_deref().unwrap_or(""));

        let vm_dir = std::env::temp_dir().join(format!("thomsen-vm-smoke-test-{}", crate::store::uuid()));
        std::fs::create_dir_all(paths::vm_disk_dir(&vm_dir)).unwrap();
        std::fs::create_dir_all(paths::vm_snapshots_dir(&vm_dir)).unwrap();

        let config = tiny_test_config("Thomsen VM Smoke Test");

        // 1. Real disk creation via qemu-img.
        provider.create_vm(&config, &vm_dir).await.expect("qemu-img disk creation should succeed");
        assert!(paths::vm_disk_file(&vm_dir).exists(), "disk image file should exist after create_vm");

        // 2. Real process spawn + QMP handshake.
        provider.start_vm(&config, &vm_dir).await.expect("qemu-system-x86_64 should start");
        assert_eq!(provider.status(&config.id).await, VmRuntimeStatus::Running);

        // 2b. Real VNC-over-WebSocket listener: not just "a port number came
        // back", but an actual TCP accept against it, proving `-vnc
        // ...,websocket=` really bound where we asked.
        let display = provider.display_info(&config.id).await.expect("a running VM should report display info");
        assert_eq!(display.host, "127.0.0.1");
        std::net::TcpStream::connect((display.host.as_str(), display.ws_port)).expect("QEMU's VNC websocket port should accept a real TCP connection");

        // 3. Real per-process stats via sysinfo, not fabricated numbers.
        let stats = provider.live_stats(&config.id).await.expect("a running VM should report live stats");
        assert!(stats.ram_used_mb.is_some(), "a running QEMU process should report nonzero-capable RAM usage");

        // 4. Real QMP control: pause/resume.
        provider.pause_vm(&config.id).await.expect("QMP `stop` should succeed");
        assert_eq!(provider.status(&config.id).await, VmRuntimeStatus::Paused);
        provider.resume_vm(&config.id).await.expect("QMP `cont` should succeed");
        assert_eq!(provider.status(&config.id).await, VmRuntimeStatus::Running);

        // 5. Real QMP control: reset (just confirm QEMU accepts the command).
        provider.reset_vm(&config.id).await.expect("QMP `system_reset` should succeed");

        // 6. Real shutdown.
        provider.kill_vm(&config.id).await.expect("terminating the VM process should succeed");
        assert_eq!(provider.status(&config.id).await, VmRuntimeStatus::Stopped);
        assert!(provider.display_info(&config.id).await.is_none(), "a stopped VM must not report display info");

        let _ = std::fs::remove_dir_all(&vm_dir);
    }

    /// Regression test for a real bug found in the field: a VM left running
    /// by a *previous* app session (its QEMU process outlived the app - the
    /// app can close before `kill_on_drop` ever gets a chance to run) must
    /// block a second `start_vm` for the same VM, rather than silently
    /// spawning a second QEMU process against the same disk image. That
    /// doesn't fail cleanly - both processes stay alive, and the newer one's
    /// WHPX vCPU faults immediately on every resume, leaving the console
    /// showing virtio-gpu's "Display output is not active." forever. Two
    /// independent `QemuProvider`s (each with its own empty in-memory
    /// `running` map) stand in for two independent app sessions, so this
    /// only exercises the on-disk `run.lock` cross-session check.
    #[tokio::test]
    async fn a_vm_left_running_by_a_previous_session_blocks_a_second_start() {
        let first_session = QemuProvider::default();
        if !first_session.availability().available {
            eprintln!("SKIPPED: QEMU is not installed on this machine");
            return;
        }

        let vm_dir = std::env::temp_dir().join(format!("thomsen-vm-lock-test-{}", crate::store::uuid()));
        std::fs::create_dir_all(paths::vm_disk_dir(&vm_dir)).unwrap();
        let config = tiny_test_config("Thomsen VM Lock Test");
        first_session.create_vm(&config, &vm_dir).await.expect("qemu-img disk creation should succeed");
        first_session.start_vm(&config, &vm_dir).await.expect("first session should start the VM");

        // A second, independent provider - stands in for a second Thomsen VM
        // process that has no idea the first one, or its QEMU child, exists.
        let second_session = QemuProvider::default();
        let result = second_session.start_vm(&config, &vm_dir).await;
        assert!(result.is_err(), "starting the same VM from an independent session should be refused, not spawn a second QEMU process");

        // Clean up the real process, then confirm a *stale* lock (naming a
        // now-dead PID) does not block a legitimate future restart.
        first_session.kill_vm(&config.id).await.expect("cleanup kill should succeed");
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        second_session.start_vm(&config, &vm_dir).await.expect("a stale lock naming a now-dead PID must not block a legitimate restart");
        second_session.kill_vm(&config.id).await.expect("final cleanup kill should succeed");

        let _ = std::fs::remove_dir_all(&vm_dir);
    }

    /// Real regression test for UEFI firmware support: a VM created with
    /// `firmware: "uefi"` must get its own real, writable VARS file (a copy
    /// of the shared template - never the template itself, never mutated in
    /// place), and QEMU must actually accept the resulting pflash CODE/VARS
    /// args and stay running - not exit immediately the way it would on a
    /// bad `-drive` argument (`start_vm`'s own fail-fast check would turn
    /// that into a normal `Err` here, so `expect`ing `Ok` is a real check).
    /// Skips itself if this QEMU install doesn't bundle EDK2/OVMF firmware
    /// (optional external tooling, same policy as every other real test
    /// here), rather than failing.
    #[tokio::test]
    async fn uefi_vm_gets_real_pflash_firmware_and_its_own_vars_file() {
        let provider = QemuProvider::default();
        if !provider.availability().available {
            eprintln!("SKIPPED: QEMU is not installed on this machine");
            return;
        }
        let bin = provider.binaries().expect("just checked availability").clone();
        let Some(firmware) = locate_uefi_firmware(&bin) else {
            eprintln!("SKIPPED: this QEMU install doesn't bundle UEFI/OVMF firmware (share/edk2-x86_64-code.fd + share/edk2-i386-vars.fd)");
            return;
        };

        let vm_dir = std::env::temp_dir().join(format!("thomsen-vm-uefi-test-{}", crate::store::uuid()));
        std::fs::create_dir_all(paths::vm_disk_dir(&vm_dir)).unwrap();
        let mut config = tiny_test_config("Thomsen VM UEFI Test");
        config.firmware = "uefi".into();

        // 1. create_vm should set up this VM's own VARS file immediately -
        // a real copy, never the shared template, byte-identical at first.
        provider.create_vm(&config, &vm_dir).await.expect("disk creation + UEFI VARS setup should succeed");
        let vars_path = paths::vm_uefi_vars_file(&vm_dir);
        assert!(vars_path.exists(), "creating a UEFI VM should copy its own VARS file");
        assert_ne!(vars_path, firmware.vars_template, "a VM's VARS file must never be the shared template itself");
        let vm_vars_bytes = std::fs::read(&vars_path).unwrap();
        let template_bytes_before = std::fs::read(&firmware.vars_template).unwrap();
        assert_eq!(vm_vars_bytes, template_bytes_before, "a freshly-copied VARS file should start identical to the template");

        // 2. Real QEMU launch with real `-drive if=pflash,...` args.
        provider.start_vm(&config, &vm_dir).await.expect("QEMU should accept the pflash CODE/VARS args and stay running");
        assert_eq!(provider.status(&config.id).await, VmRuntimeStatus::Running);
        provider.kill_vm(&config.id).await.expect("cleanup kill should succeed");
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

        // 3. "Do NOT modify the original OVMF_VARS template directly" -
        // mutate this VM's own copy (standing in for the guest writing a
        // UEFI variable during boot) and confirm the shared template, read
        // fresh from disk, is byte-identical to before.
        std::fs::write(&vars_path, b"mutated-by-test").unwrap();
        let template_bytes_after = std::fs::read(&firmware.vars_template).unwrap();
        assert_eq!(template_bytes_after, template_bytes_before, "the shared VARS template must never be modified by any VM");

        let _ = std::fs::remove_dir_all(&vm_dir);
    }
}
