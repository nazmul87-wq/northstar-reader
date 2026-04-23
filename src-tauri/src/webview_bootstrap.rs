//! On Windows, Tauri needs the Edge WebView2 Runtime. When users run the portable `.exe`
//! directly (no MSI/NSIS), we ensure the Evergreen runtime is present: download Microsoft’s
//! bootstrapper if needed, run `/silent /install`, then relaunch this process once.

use std::{
    env,
    fs,
    io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    ptr,
};

use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

const WEBVIEW2_FWLINK: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
const BOOTSTRAP_ENV: &str = "NORTHSTAR_WEBVIEW2_BOOTSTRAP_DONE";

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn alert_error(message: &str) {
    let title = to_wide("Northstar");
    let body = to_wide(message);
    MessageBoxW(ptr::null_mut(), body.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR);
}

fn edge_webview_application_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(pf) = env::var("ProgramFiles(x86)") {
        out.push(PathBuf::from(pf));
    }
    if let Ok(pf) = env::var("ProgramFiles") {
        out.push(PathBuf::from(pf));
    }
    if let Ok(ld) = env::var("LOCALAPPDATA") {
        out.push(PathBuf::from(ld));
    }
    out
}

fn webview2_runtime_present() -> bool {
    for root in edge_webview_application_dirs() {
        let app = root.join("Microsoft").join("EdgeWebView").join("Application");
        if !app.is_dir() {
            continue;
        }
        if let Ok(rd) = fs::read_dir(&app) {
            for entry in rd.flatten() {
                let version_dir = entry.path();
                if version_dir.join("msedgewebview2.exe").is_file() {
                    return true;
                }
            }
        }
    }
    false
}

fn system_curl() -> PathBuf {
    let windir = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    PathBuf::from(windir).join("System32").join("curl.exe")
}

fn download_bootstrapper(dest: &Path) -> io::Result<()> {
    let curl = system_curl();
    if curl.is_file() {
        let status = Command::new(&curl)
            .args(["-fsSL", WEBVIEW2_FWLINK, "-o"])
            .arg(dest)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;
        if status.success() && dest.is_file() {
            return Ok(());
        }
    }

    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile '{}'",
                WEBVIEW2_FWLINK,
                dest.display()
            ),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    if status.success() && dest.is_file() {
        return Ok(());
    }

    Err(io::Error::new(
        io::ErrorKind::Other,
        "could not download WebView2 bootstrapper (curl and PowerShell both failed)",
    ))
}

fn run_bootstrapper(installer: &Path) -> io::Result<bool> {
    let status = Command::new(installer)
        .args(["/silent", "/install"])
        .status()?;
    Ok(status.success())
}

fn relaunch_self() -> io::Result<()> {
    let exe = env::current_exe()?;
    let mut cmd = Command::new(exe);
    cmd.env(BOOTSTRAP_ENV, "1");
    for arg in env::args().skip(1) {
        cmd.arg(arg);
    }
    cmd.spawn()?;
    Ok(())
}

pub fn ensure_webview2_runtime() {
    if env::var(BOOTSTRAP_ENV).is_ok() {
        return;
    }

    if webview2_runtime_present() {
        return;
    }

    let tmp = env::temp_dir().join("Northstar-MicrosoftEdgeWebview2Setup.exe");
    let _ = fs::remove_file(&tmp);

    if let Err(e) = download_bootstrapper(&tmp) {
        unsafe {
            alert_error(&format!(
                "Microsoft Edge WebView2 Runtime is required but could not be downloaded.\n\nDetails: {e}\n\nInstall WebView2 from:\n{WEBVIEW2_FWLINK}"
            ));
        }
        std::process::exit(1);
    }

    let installed_ok = match run_bootstrapper(&tmp) {
        Ok(v) => v,
        Err(e) => {
            unsafe {
                alert_error(&format!(
                    "WebView2 setup could not be started.\n\nDetails: {e}\n\nInstall manually from:\n{WEBVIEW2_FWLINK}"
                ));
            }
            std::process::exit(1);
        }
    };

    let _ = fs::remove_file(&tmp);

    if !installed_ok {
        unsafe {
            alert_error(&format!(
                "WebView2 setup did not complete successfully.\n\nInstall manually from:\n{WEBVIEW2_FWLINK}"
            ));
        }
        std::process::exit(1);
    }

    if webview2_runtime_present() {
        if relaunch_self().is_ok() {
            std::process::exit(0);
        }
        // Runtime is present; relaunch failed (e.g. permissions). Continue in this process.
        return;
    }

    unsafe {
        alert_error(&format!(
            "WebView2 setup reported success, but the runtime was not detected.\n\
             Reboot if Windows asked for one, then try again.\n\n\
             Manual install:\n{WEBVIEW2_FWLINK}"
        ));
    }
    std::process::exit(1);
}
