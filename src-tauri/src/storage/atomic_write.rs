use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::{AppError, AppResult};

pub fn write_text_atomic(target: &Path, contents: &str) -> AppResult<()> {
    let parent = target.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "{} does not have a writable parent directory",
            target.to_string_lossy()
        ))
    })?;

    fs::create_dir_all(parent)?;
    let temp_path = unique_temp_path(target)?;

    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        file.write_all(contents.as_bytes())?;
        file.flush()?;
        file.sync_all()?;
    }

    replace_atomically(&temp_path, target)?;
    Ok(())
}

fn unique_temp_path(target: &Path) -> AppResult<PathBuf> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidPath(target.to_string_lossy().into_owned()))?;
    let parent = target
        .parent()
        .ok_or_else(|| AppError::InvalidPath(target.to_string_lossy().into_owned()))?;

    for attempt in 0..8 {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let candidate = parent.join(format!(
            ".{file_name}.{}.{}.tmp",
            process::id(),
            suffix + attempt as u128
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(AppError::InvalidPath(format!(
        "failed to allocate temp file for {}",
        target.to_string_lossy()
    )))
}

#[cfg(not(windows))]
fn replace_atomically(temp_path: &Path, target: &Path) -> AppResult<()> {
    fs::rename(temp_path, target)?;
    Ok(())
}

#[cfg(windows)]
fn replace_atomically(temp_path: &Path, target: &Path) -> AppResult<()> {
    use std::{iter, os::windows::ffi::OsStrExt};

    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let to_wide = |value: &Path| -> Vec<u16> {
        value.as_os_str()
            .encode_wide()
            .chain(iter::once(0))
            .collect()
    };

    let source = to_wide(temp_path);
    let destination = to_wide(target);
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;

    let result = unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), flags) };
    if result == 0 {
        let error = std::io::Error::last_os_error();
        let _ = fs::remove_file(temp_path);
        return Err(AppError::Io(error));
    }

    if std::fs::File::open(target).is_err() {
        return Err(AppError::InvalidPath(target.to_string_lossy().into_owned()));
    }

    Ok(())
}
