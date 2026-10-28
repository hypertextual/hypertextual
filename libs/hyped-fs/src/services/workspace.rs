use std::{
    fs,
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
}

impl WorkspaceService {
    /// Selects the default workspace under the supplied home directory.
    pub fn from_home(home: PathBuf) -> Self {
        Self {
            workspace: Workspace::from_home(home),
        }
    }

    pub(super) fn root(&self) -> Result<PathBuf> {
        fs::create_dir_all(&self.workspace.root)?;
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
            // Atomic-save temporary files are not articles.
            if (name.starts_with(".hypertextual-save-") || name.starts_with(".hyped-fs-save-"))
                || name == ".images"
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
}
