//! Best-effort ISO inspection for the Create VM wizard's ISO step: real bytes
//! read from the file, never a guess presented as certainty.

use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Read the ISO9660 Primary Volume Descriptor's Volume Identifier.
/// Sector size is 2048 bytes; the PVD is at sector 16, and the Volume
/// Identifier is a 32-byte, space-padded field at byte offset 40 within it -
/// fixed values from the ISO9660 spec, not a heuristic.
pub fn read_volume_label(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let offset = 16 * 2048 + 40;
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = [0u8; 32];
    file.read_exact(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let trimmed = text.trim().trim_end_matches('\0').trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

/// Match common installer-media naming patterns in the filename and/or the
/// ISO9660 volume label. Returns `(osFamily, presetId)`, both `None` when
/// nothing recognizable was found - the caller shows "Unknown" rather than a
/// fabricated guess.
pub fn guess_os(file_name: &str, volume_label: Option<&str>) -> (Option<String>, Option<String>) {
    let haystack = format!("{file_name} {}", volume_label.unwrap_or("")).to_uppercase();

    let checks: &[(&str, &str, &str)] = &[
        ("KALI", "linux", "kali-linux"),
        ("UBUNTU", "linux", "ubuntu"),
        ("DEBIAN", "linux", "debian"),
        ("ARCH", "linux", "arch-linux"),
    ];
    for (needle, family, preset) in checks {
        if haystack.contains(needle) {
            return (Some(family.to_string()), Some(preset.to_string()));
        }
    }

    // Windows installer media: filenames commonly carry "11"/"10" next to
    // "win"; the volume label alone (e.g. "CCCOMA_X64FRE_EN-US_DV9") rarely
    // distinguishes the version, but its "CCCOMA"/"CPBA" prefixes are a
    // strong real-world signal that it *is* Windows install media at all.
    let looks_like_windows_label = haystack.contains("CCCOMA") || haystack.contains("CPBA_X64FRE") || haystack.contains("GGGGG");
    let mentions_win = haystack.contains("WIN");
    if mentions_win || looks_like_windows_label {
        if haystack.contains("11") {
            return (Some("windows".into()), Some("windows-11".into()));
        }
        if haystack.contains("10") {
            return (Some("windows".into()), Some("windows-10".into()));
        }
        return (Some("windows".into()), None);
    }

    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guess_os_matches_kali_from_filename() {
        assert_eq!(guess_os("kali-linux-2024.4-installer-amd64.iso", None), (Some("linux".into()), Some("kali-linux".into())));
    }

    #[test]
    fn guess_os_matches_ubuntu_from_volume_label_when_filename_is_generic() {
        assert_eq!(guess_os("installer.iso", Some("Ubuntu 24.04.1 LTS amd64")), (Some("linux".into()), Some("ubuntu".into())));
    }

    #[test]
    fn guess_os_matches_windows_11_from_filename() {
        assert_eq!(guess_os("Win11_24H2_English_x64.iso", None), (Some("windows".into()), Some("windows-11".into())));
    }

    #[test]
    fn guess_os_matches_windows_generic_label_without_a_version_number() {
        // Real official Windows media volume label pattern - no "10"/"11" in
        // either the filename or the label, so the family is known but the
        // specific version genuinely isn't.
        assert_eq!(guess_os("installer.iso", Some("CCCOMA_X64FRE_EN-US_DV9")), (Some("windows".into()), None));
    }

    #[test]
    fn guess_os_returns_unknown_for_unrecognized_media() {
        assert_eq!(guess_os("myosimage.iso", Some("DATA")), (None, None));
    }

    #[test]
    fn guess_os_checks_linux_presets_before_the_windows_fallback() {
        // A filename that happens to contain "win" (e.g. as part of a longer
        // word) must not shadow an explicit distro match.
        assert_eq!(guess_os("kali-linux-live-win-builder.iso", None), (Some("linux".into()), Some("kali-linux".into())));
    }
}
