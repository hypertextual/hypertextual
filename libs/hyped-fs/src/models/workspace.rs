use crate::error::{Result, error};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

/// Default name assigned to the automatically bootstrapped workspace.
pub const DEFAULT_WORKSPACE_NAME: &str = "Local workspace";

fn default_available() -> bool {
    true
}

fn default_sidebar_open() -> bool {
    true
}

/// The location of a local article workspace.
pub struct Workspace {
    /// The directory that contains the workspace files.
    pub root: PathBuf,
}

impl Workspace {
    /// Builds the default workspace location without accessing the filesystem.
    pub fn from_home(home: PathBuf) -> Self {
        Self {
            root: home.join(".hypertextual").join("workspace"),
        }
    }

    /// Builds a workspace rooted at an arbitrary user-chosen directory.
    pub fn from_root(root: PathBuf) -> Self {
        Self { root }
    }
}

/// Sync lifecycle status for a synced or online-managed workspace (reserved for `hyped-fs sync`).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceSyncState {
    /// Local and remote copies match.
    Idle,
    /// Local changes are queued for upload.
    Pending,
    /// Sync is paused by user action or a safety guard.
    Paused,
    /// Last sync attempt failed and needs attention.
    Error,
}

/// Storage and sync mode for a registered workspace.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WorkspaceBacking {
    /// Purely local directory on disk.
    Local {
        /// Canonical absolute path to the workspace directory.
        path: String,
    },
    /// Local directory on disk bound to an online account for markerless sync.
    Synced {
        /// Canonical absolute path to the local workspace directory.
        path: String,
        /// Owning online account identifier.
        account_id: String,
        /// Remote workspace identifier bound to this local folder.
        remote_workspace_id: String,
        /// Current sync status.
        sync_state: WorkspaceSyncState,
        /// Optional OS volume/device identifier for unmounted-drive safety checks.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        root_device_id: Option<u64>,
    },
    /// Future cloud-managed workspace with no user-managed local folder.
    Remote {
        /// Owning online account identifier.
        account_id: String,
        /// Remote workspace identifier.
        remote_workspace_id: String,
    },
}

impl WorkspaceBacking {
    /// Returns the local directory path when the workspace is backed by a local folder.
    pub fn local_path(&self) -> Option<&str> {
        match self {
            Self::Local { path } | Self::Synced { path, .. } => Some(path),
            Self::Remote { .. } => None,
        }
    }
}

/// Persistent metadata for one tracked workspace in `~/.hypertextual/workspaces.json`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    /// Unique human-readable workspace name (case-insensitive unique, defaults to folder basename).
    pub name: String,
    /// Storage and sync backing mode (`local`, `synced`, or `remote`).
    pub backing: WorkspaceBacking,
    /// Unix epoch milliseconds when this workspace was last opened.
    pub last_opened_at: u64,
    /// Derived at read time: true when a local/synced directory exists on disk.
    #[serde(default = "default_available")]
    pub available: bool,
}

/// Snapshot of all tracked workspaces and the currently active workspace name.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegistrySnapshot {
    /// Name of the currently active workspace.
    pub active_workspace: String,
    /// Ordered list of registered workspaces.
    pub workspaces: Vec<WorkspaceRecord>,
}

/// Persisted UI state for one workspace in `~/.hypertextual/workspaces/<name>/state.json`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUiState {
    /// Ordered relative paths of open document tabs.
    #[serde(default)]
    pub open_tabs: Vec<String>,
    /// Relative path of the currently focused tab, if any.
    #[serde(default)]
    pub active_tab: Option<String>,
    /// Relative paths of expanded folders in the workspace tree.
    #[serde(default)]
    pub expanded_folders: Vec<String>,
    /// Whether the workspace sidebar is open.
    #[serde(default = "default_sidebar_open")]
    pub sidebar_open: bool,
}

impl Default for WorkspaceUiState {
    fn default() -> Self {
        Self {
            open_tabs: Vec::new(),
            active_tab: None,
            expanded_folders: Vec::new(),
            sidebar_open: true,
        }
    }
}

/// Partial update merged into [`WorkspaceUiState`].
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatePatch {
    /// Replacement ordered open tab paths when provided.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_tabs: Option<Vec<String>>,
    /// Replacement active tab path (`Some(None)` clears the active tab).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_tab: Option<Option<String>>,
    /// Replacement expanded folder paths when provided.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expanded_folders: Option<Vec<String>>,
    /// Replacement sidebar open state when provided.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_open: Option<bool>,
}

impl WorkspaceUiState {
    /// Applies a partial patch to this state in memory.
    pub fn apply_patch(&mut self, patch: WorkspaceStatePatch) {
        if let Some(open_tabs) = patch.open_tabs {
            self.open_tabs = open_tabs;
        }
        if let Some(active_tab) = patch.active_tab {
            self.active_tab = active_tab;
        }
        if let Some(expanded_folders) = patch.expanded_folders {
            self.expanded_folders = expanded_folders;
        }
        if let Some(sidebar_open) = patch.sidebar_open {
            self.sidebar_open = sidebar_open;
        }
    }
}

/// The workspace location and its top-level entries.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListing {
    /// The absolute path to the workspace directory.
    pub root: String,
    /// The visible entries directly inside the workspace.
    pub entries: Vec<WorkspaceNode>,
}

/// A file or folder listed in the workspace.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    /// The path relative to the workspace root.
    pub path: String,
    /// The file or folder name, including any extension.
    pub name: String,
    /// The entry type: `directory`, `file`, or `unavailable`.
    pub kind: &'static str,
}

impl WorkspaceNode {
    /// Trims a name and rejects names that cannot identify one workspace entry.
    pub fn validate_name(name: &str) -> Result<&str> {
        let name = name.trim();
        let mut components = Path::new(name).components();
        if name.is_empty()
            || name.contains(['/', '\\', ':', '\0'])
            || !matches!(components.next(), Some(Component::Normal(_)))
            || components.next().is_some()
            || (name.starts_with(".hypertextual-save-") || name.starts_with(".hyped-fs-save-"))
        {
            return Err(error(
                "invalidName",
                "Enter a name without slashes or colons.",
            ));
        }
        Ok(name)
    }

    /// Rejects executable binaries, scripts, and Unix executable files before opening in the default app.
    pub fn validate_default_app_target(
        relative: &str,
        head: &[u8],
        is_executable_mode: bool,
    ) -> Result<()> {
        const EXECUTABLE_EXTENSIONS: &[&str] = &[
            "app", "bash", "bat", "bin", "cmd", "com", "command", "dll", "dylib", "exe", "msi",
            "ps1", "run", "scr", "sh", "so", "tool", "vbs", "zsh",
        ];
        let extension = Path::new(relative)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let is_mach_o = matches!(
            head,
            [0xFE, 0xED, 0xFA, 0xCE, ..]
                | [0xCE, 0xFA, 0xED, 0xFE, ..]
                | [0xFE, 0xED, 0xFA, 0xCF, ..]
                | [0xCF, 0xFA, 0xED, 0xFE, ..]
                | [0xCA, 0xFE, 0xBA, 0xBE, ..]
                | [0xBE, 0xBA, 0xFE, 0xCA, ..]
        );
        if is_executable_mode
            || EXECUTABLE_EXTENSIONS.contains(&extension.as_str())
            || head.starts_with(b"\x7FELF")
            || head.starts_with(b"MZ")
            || head.starts_with(b"#!")
            || is_mach_o
        {
            return Err(error(
                "unsupported",
                "Executable files cannot be opened in the default application.",
            ));
        }
        Ok(())
    }
}
