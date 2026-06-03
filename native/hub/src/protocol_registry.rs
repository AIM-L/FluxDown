//! Windows `fluxdown://` URL protocol handler registration via HKCU registry.
//!
//! Registry structure:
//! ```text
//! HKCU\Software\Classes\fluxdown                             → "URL:FluxDown Protocol"
//! HKCU\Software\Classes\fluxdown  "URL Protocol"             → ""
//! HKCU\Software\Classes\fluxdown\DefaultIcon                 → "\"<exe>\",0"
//! HKCU\Software\Classes\fluxdown\shell\open\command           → "\"<exe>\" \"%1\""
//! ```
//!
//! All operations target `HKEY_CURRENT_USER` — no admin elevation required.

#[cfg(target_os = "windows")]
mod inner {
    use crate::logger::log_info;
    use std::io;
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};

    const PROTOCOL: &str = "fluxdown";
    const PROTOCOL_DESC: &str = "URL:FluxDown Protocol";

    /// Get the canonical path of the current running executable.
    ///
    /// Uses `std::fs::canonicalize` to resolve symlinks and `\\?\` prefixes,
    /// then strips the `\\?\` prefix (if any) for clean comparison with
    /// registry values written by `register()`.
    fn exe_path() -> Result<String, io::Error> {
        let path = std::env::current_exe()?;
        let canonical = std::fs::canonicalize(&path).unwrap_or(path);
        let s = canonical.to_string_lossy().into_owned();
        Ok(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
    }

    /// Check whether the `fluxdown://` protocol is currently registered **to this
    /// running executable**.
    ///
    /// Returns `true` only if `HKCU\Software\Classes\fluxdown` exists, has a
    /// `URL Protocol` value (which identifies it as a protocol handler), **and**
    /// its `shell\open\command` default value points to the current exe.
    ///
    /// The exe-path check is what prevents a stale registration from being kept
    /// after the app is moved, upgraded, or run as a different portable build:
    /// without it, the presence of the (now-wrong) key would make startup skip
    /// re-registration and leave `fluxdown://` pointing at a dead/old exe. This
    /// mirrors `nmh_registry::needs_update`'s exe-drift detection. If the exe
    /// path cannot be determined, the value check alone decides the result so we
    /// do not spuriously force re-registration on a transient I/O error.
    pub fn is_registered() -> bool {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let key =
            match hkcu.open_subkey_with_flags(format!("Software\\Classes\\{PROTOCOL}"), KEY_READ) {
                Ok(k) => k,
                Err(_) => return false,
            };

        // The presence of "URL Protocol" value is what makes this a protocol handler.
        let url_protocol: Result<String, _> = key.get_value("URL Protocol");
        if url_protocol.is_err() {
            return false;
        }

        // Determine the current exe path; if it cannot be resolved, fall back to
        // the legacy "value exists" semantics rather than forcing re-registration.
        let current_exe = match exe_path() {
            Ok(p) => p,
            Err(_) => return true,
        };

        // Read shell\open\command's default value and extract the exe it points
        // to. The stored form is `"<exe>" "%1"`; we extract the first
        // double-quoted token (the exe path).
        let registered_exe = match read_command_exe(&hkcu) {
            Some(exe) => exe,
            // Command subkey/value missing: registration is incomplete → treat as
            // not registered to this exe so startup rewrites it.
            None => return false,
        };

        paths_equivalent(&registered_exe, &current_exe)
    }

    /// Read `Software\Classes\fluxdown\shell\open\command`'s default value and
    /// extract the executable path (the first double-quoted token).
    ///
    /// Returns `None` if the key/value is missing or no quoted token is present.
    fn read_command_exe(hkcu: &RegKey) -> Option<String> {
        let cmd_key = hkcu
            .open_subkey_with_flags(
                format!("Software\\Classes\\{PROTOCOL}\\shell\\open\\command"),
                KEY_READ,
            )
            .ok()?;
        let command: String = cmd_key.get_value("").ok()?;

        // Extract the substring between the first pair of double quotes.
        let after_first = command.find('"')? + 1;
        let rest = &command[after_first..];
        let end = rest.find('"')?;
        Some(rest[..end].to_string())
    }

    /// Compare two Windows exe paths for equivalence.
    ///
    /// Canonicalizes both (resolving symlinks / `\\?\` prefixes) when possible
    /// and compares case-insensitively, matching Windows' case-insensitive file
    /// system semantics. Falls back to a case-insensitive comparison of the raw
    /// strings if canonicalization fails (e.g. the registered exe no longer
    /// exists), which still correctly reports a stale/moved registration.
    fn paths_equivalent(a: &str, b: &str) -> bool {
        let norm = |s: &str| -> String {
            let canonical = std::fs::canonicalize(s)
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| s.to_string());
            canonical
                .strip_prefix(r"\\?\")
                .unwrap_or(&canonical)
                .to_ascii_lowercase()
        };
        norm(a) == norm(b)
    }

    /// Register the `fluxdown://` URL protocol handler.
    pub fn register() -> Result<(), io::Error> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let exe = exe_path()?;

        // 1. fluxdown → "URL:FluxDown Protocol"
        let (proto_key, _) =
            hkcu.create_subkey_with_flags(format!("Software\\Classes\\{PROTOCOL}"), KEY_WRITE)?;
        proto_key.set_value("", &PROTOCOL_DESC)?;
        // The empty "URL Protocol" value is required to mark this as a URL protocol handler.
        proto_key.set_value("URL Protocol", &"")?;

        // 2. DefaultIcon
        let (icon_key, _) = hkcu.create_subkey_with_flags(
            format!("Software\\Classes\\{PROTOCOL}\\DefaultIcon"),
            KEY_WRITE,
        )?;
        icon_key.set_value("", &format!("\"{exe}\",0"))?;

        // 3. shell\open\command
        let (cmd_key, _) = hkcu.create_subkey_with_flags(
            format!("Software\\Classes\\{PROTOCOL}\\shell\\open\\command"),
            KEY_WRITE,
        )?;
        cmd_key.set_value("", &format!("\"{exe}\" \"%1\""))?;

        // Notify the shell about the change
        notify_shell();

        log_info!("[protocol_registry] registered fluxdown:// protocol (exe={exe})");
        Ok(())
    }

    /// Remove the `fluxdown://` URL protocol registration.
    pub fn unregister() -> Result<(), io::Error> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // Only remove if currently registered (don't break other app's registration)
        if !is_registered() {
            log_info!("[protocol_registry] not registered to FluxDown, skipping removal");
            return Ok(());
        }

        // Remove fluxdown protocol tree
        let classes = hkcu.open_subkey_with_flags("Software\\Classes", KEY_WRITE)?;
        let _ = classes.delete_subkey_all(PROTOCOL);

        // Notify the shell about the change
        notify_shell();

        log_info!("[protocol_registry] removed fluxdown:// protocol registration");
        Ok(())
    }

    /// Call SHChangeNotify to inform Explorer about association changes.
    fn notify_shell() {
        // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
        #[link(name = "shell32")]
        unsafe extern "system" {
            fn SHChangeNotify(
                wEventId: i32,
                uFlags: u32,
                dwItem1: *const std::ffi::c_void,
                dwItem2: *const std::ffi::c_void,
            );
        }
        unsafe {
            SHChangeNotify(0x08000000, 0, std::ptr::null(), std::ptr::null());
        }
    }
}

// Non-Windows stubs — URL protocol registration is Windows-only.
#[cfg(not(target_os = "windows"))]
mod inner {
    use std::io;

    pub fn is_registered() -> bool {
        false
    }

    pub fn register() -> Result<(), io::Error> {
        Ok(())
    }

    pub fn unregister() -> Result<(), io::Error> {
        Ok(())
    }
}

pub use inner::{is_registered, register, unregister};
