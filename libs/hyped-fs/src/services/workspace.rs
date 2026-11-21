use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

use crate::{
    error::{Result, error},
    models::{ArticleContent, Workspace, WorkspaceListing, WorkspaceNode},
};

/// Browses and changes entries within one local workspace.
pub struct WorkspaceService {
    /// The workspace location shared by file operations.
    workspace: Workspace,
    /// Whether `root()` may automatically create a missing directory (true only for default bootstrap).
    auto_create: bool,
}

impl WorkspaceService {
    /// Selects the default workspace under the supplied home directory.
    pub fn from_home(home: PathBuf) -> Self {
        Self {
            workspace: Workspace::from_home(home),
            auto_create: true,
        }
    }

    /// Selects an existing workspace rooted at an arbitrary directory without auto-creating it.
    pub fn from_root(root: PathBuf) -> Self {
        Self {
            workspace: Workspace::from_root(root),
            auto_create: false,
        }
    }

    pub(super) fn root(&self) -> Result<PathBuf> {
        if self.auto_create {
            fs::create_dir_all(&self.workspace.root)?;
        } else if !self.workspace.root.is_dir() {
            return Err(error(
                "missingWorkspace",
                "Workspace folder could not be found on disk.",
            ));
        }
        Ok(self.workspace.root.canonicalize()?)
    }

    pub(super) fn resolve(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || relative.contains('\\')
            || relative.contains(':')
        {
            return Err(error(
                "outsideWorkspace",
                "Choose a file inside the workspace.",
            ));
        }
        let root = self.root()?;
        let resolved = root.join(path).canonicalize()?;
        if !resolved.starts_with(&root) {
            return Err(error(
                "outsideWorkspace",
                "Links outside the workspace cannot be opened.",
            ));
        }
        Ok(resolved)
    }

    pub fn open(&self) -> Result<WorkspaceListing> {
        Ok(WorkspaceListing {
            root: self.root()?.to_string_lossy().into_owned(),
            entries: self.list("")?,
        })
    }

    pub fn list(&self, relative: &str) -> Result<Vec<WorkspaceNode>> {
        let directory = self.resolve(relative)?;
        let root = self.root()?;
        let mut entries = Vec::new();
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| error("invalidName", "A workspace filename is not valid Unicode."))?;
            // Atomic-save temporary files and VCS/OS metadata are never workspace entries.
            if name.starts_with(".hypertextual-save-")
                || name.starts_with(".hyped-fs-save-")
                || name == ".git"
                || name == ".DS_Store"
            {
                continue;
            }
            let path = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            let canonical = entry.path().canonicalize();
            let kind = match canonical {
                Ok(p) if p.starts_with(&root) && p.is_dir() => "directory",
                Ok(p) if p.starts_with(&root) && p.is_file() => "file",
                _ => "unavailable",
            };
            entries.push(WorkspaceNode { path, name, kind });
        }
        entries.sort_by(|a, b| {
            (a.kind != "directory")
                .cmp(&(b.kind != "directory"))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }

    pub fn create_folder_in(&self, name: &str, parent: &str) -> Result<WorkspaceNode> {
        let name = WorkspaceNode::validate_name(name)?;
        fs::create_dir(self.resolve(parent)?.join(name)).map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                error(
                    "nameUnavailable",
                    "A file or folder with this name already exists.",
                )
            } else {
                e.into()
            }
        })?;
        Ok(WorkspaceNode {
            path: if parent.is_empty() {
                name.to_owned()
            } else {
                format!("{parent}/{name}")
            },
            name: name.to_owned(),
            kind: "directory",
        })
    }

    pub fn rename(&self, relative: &str, name: &str) -> Result<WorkspaceNode> {
        let name = WorkspaceNode::validate_name(name)?;
        let source = self.resolve(relative)?;
        let root = self.root()?;
        // Rename the workspace entry itself; reject symlinks rather than renaming their targets.
        let original = root.join(relative);
        if fs::symlink_metadata(&original)?.file_type().is_symlink() {
            return Err(error("unsupported", "Linked entries cannot be renamed."));
        }
        let kind = if source.is_dir() { "directory" } else { "file" };
        if kind == "file" {
            ArticleContent::validate_path(name)?;
        }
        let target = source.parent().unwrap().join(name);
        if source != target {
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            rustix::fs::renameat_with(
                rustix::fs::CWD,
                &source,
                rustix::fs::CWD,
                &target,
                rustix::fs::RenameFlags::NOREPLACE,
            )
            .map_err(|e| error("io", std::io::Error::from(e).to_string()))?;
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                let source_wide: Vec<u16> =
                    source.as_os_str().encode_wide().chain(Some(0)).collect();
                let target_wide: Vec<u16> =
                    target.as_os_str().encode_wide().chain(Some(0)).collect();
                // SAFETY: Both pointers refer to live, NUL-terminated UTF-16 path buffers.
                let moved = unsafe {
                    windows_sys::Win32::Storage::FileSystem::MoveFileW(
                        source_wide.as_ptr(),
                        target_wide.as_ptr(),
                    )
                };
                if moved == 0 {
                    return Err(std::io::Error::last_os_error().into());
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
            {
                // Fail closed on platforms without an exclusive rename operation.
                return Err(error(
                    "unsupported",
                    "Renaming is not supported on this platform yet.",
                ));
            }
        }
        let path = target
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        Ok(WorkspaceNode {
            path,
            name: name.to_owned(),
            kind,
        })
    }

    pub fn delete(&self, relative: &str) -> Result<()> {
        if relative.is_empty() {
            return Err(error(
                "outsideWorkspace",
                "The workspace itself cannot be deleted.",
            ));
        }
        let path = self.resolve(relative)?;
        if fs::symlink_metadata(self.root()?.join(relative))?
            .file_type()
            .is_symlink()
        {
            return Err(error("unsupported", "Linked entries cannot be deleted."));
        }
        trash::delete(path).map_err(|e| error("io", e.to_string()))
    }

    pub fn open_in_default_app(&self, relative: &str) -> Result<()> {
        let path = self.resolve(relative)?;
        let metadata = fs::metadata(&path)?;
        if !metadata.is_file() {
            return Err(error("unsupported", "Only workspace files can be opened."));
        }
        #[cfg(unix)]
        let is_executable_mode = {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111 != 0
        };
        #[cfg(not(unix))]
        let is_executable_mode = false;
        let mut head = [0u8; 4];
        let bytes_read = fs::File::open(&path)?.take(4).read(&mut head)?;
        WorkspaceNode::validate_default_app_target(
            relative,
            &head[..bytes_read],
            is_executable_mode,
        )?;
        if let Some(preferred_app) = Self::preferred_app_for_path(relative)
            && Self::try_open_with_app(preferred_app, &path)
        {
            return Ok(());
        }
        #[cfg(target_os = "macos")]
        let status = std::process::Command::new("open").arg(&path).status();
        #[cfg(target_os = "linux")]
        let status = std::process::Command::new("xdg-open").arg(&path).status();
        #[cfg(windows)]
        let status = std::process::Command::new("explorer").arg(&path).status();
        #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
        return Err(error(
            "unsupported",
            "Opening files in the default application is not supported on this platform.",
        ));
        #[cfg(any(target_os = "macos", target_os = "linux", windows))]
        {
            let status = status.map_err(|e| error("io", e.to_string()))?;
            if !status.success() {
                return Err(error(
                    "io",
                    "Could not open the file in the default application.",
                ));
            }
            Ok(())
        }
    }

    /// Resolves a built-in preferred application for compound or specialized file extensions.
    pub fn preferred_app_for_path(relative: &str) -> Option<&'static str> {
        /// Data-driven mapping from compound-extension patterns to preferred desktop apps.
        const OPEN_WITH_OVERRIDES: &[(&str, &str)] =
            &[(".drawio.", "draw.io"), (".drawio", "draw.io")];

        let filename = Path::new(relative)
            .file_name()?
            .to_string_lossy()
            .to_lowercase();
        for &(pattern, app) in OPEN_WITH_OVERRIDES {
            if pattern.ends_with('.') {
                if let Some(idx) = filename.find(pattern)
                    && idx > 0
                    && idx + pattern.len() < filename.len()
                {
                    return Some(app);
                }
            } else if filename.ends_with(pattern) && filename.len() > pattern.len() {
                return Some(app);
            }
        }
        None
    }

    /// Attempts to open a file with a preferred application, returning true on launch success.
    fn try_open_with_app(app: &str, path: &Path) -> bool {
        #[cfg(target_os = "macos")]
        let status = std::process::Command::new("open")
            .arg("-a")
            .arg(app)
            .arg(path)
            .status();
        #[cfg(target_os = "linux")]
        let status = {
            let binary = if app == "draw.io" { "drawio" } else { app };
            std::process::Command::new(binary).arg(path).status()
        };
        #[cfg(windows)]
        let status = std::process::Command::new("cmd")
            .args(["/C", "start", "", app])
            .arg(path)
            .status();
        #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
        let status: std::io::Result<std::process::ExitStatus> = Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "unsupported platform",
        ));

        matches!(status, Ok(s) if s.success())
    }
}
