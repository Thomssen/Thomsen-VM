# Thomsen VM

A simple, modern virtual machine manager for Windows, built on QEMU.

## Features

- Create and run virtual machines (Windows, Linux, or other) from an ISO
- Guided VM creation with automatic hardware suggestions and ISO detection
- UEFI or Legacy BIOS firmware, selectable per VM
- Live console with real full screen: correct monitor targeting, proportional
  scaling, no stretching, toggle with F11 or Esc
- Snapshots: create, restore, delete
- Start, stop, pause, resume, restart, Ctrl+Alt+Del
- Optional app lock with password protection
- Dark, minimal interface with a choice of window control styles
- No subscription, no ads, no telemetry

## Requirements

- Windows 10 or 11, 64-bit
- [QEMU for Windows](https://www.qemu.org/download/#windows), installed and
  either on `PATH` or in its default `Program Files` location (not bundled)
- Hardware virtualization (Intel VT-x / AMD-V) enabled in firmware

## Install using the EXE

Download [`release/Thomsen-VM-Setup.exe`](release/Thomsen-VM-Setup.exe) from
this repository and run it. It installs for the current user only and
doesn't require administrator rights. On first launch it runs a short setup
wizard.

## Build from source

Requires [Node.js](https://nodejs.org) 20+, the
[Rust toolchain](https://rustup.rs), and QEMU installed as above.

```
npm install
npm run release
```

This produces an NSIS installer under
`src-tauri/target/release/bundle/nsis/`. For a dev build with hot reload,
use `npm start` instead.

## Author

Built by **Thomsen**
[thomssen.dev](https://thomssen.dev) · [github.com/Thomssen](https://github.com/Thomssen)

## License

Free to download and use. Not open-source - see [LICENSE](LICENSE) for
what's permitted.
