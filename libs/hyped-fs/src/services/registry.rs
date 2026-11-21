use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use crate::{
    error::{Result, error},
    models::{
        DEFAULT_WORKSPACE_NAME, Workspace, WorkspaceBacking, WorkspaceNode, WorkspaceRecord,
        WorkspaceRegistrySnapshot, WorkspaceStatePatch, WorkspaceUiState,
    },
};

/// Persisted on-disk format for `~/.hypertextual/workspaces.json`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryFile {
    /// Schema version for forward-compatible migrations.
    schema_version: u32,
    /// Name of the currently active workspace.
    active_workspace: String,
    /// Registered workspace records.
    workspaces: Vec<WorkspaceRecord>,
}

/// Manages the global markerless workspace registry under `~/.hypertextual/`.
pub struct WorkspaceRegistry {
    /// User home directory containing `.hypertextual/workspaces.json` and per-workspace UI state.
    home: PathBuf,
}

impl WorkspaceRegistry {
    /// Creates a registry backed by `<home>/.hypertextual/`.
    pub fn from_home(home: PathBuf) -> Self {
        Self { home }
    }

    /// Lists all registered workspaces with live availability flags and the active workspace name.
    pub fn list(&self) -> Result<WorkspaceRegistrySnapshot> {
        let file = self.load_or_bootstrap()?;
        Ok(Self::to_snapshot(file))
    }

    /// Returns the currently active workspace record with live availability.
    pub fn active(&self) -> Result<WorkspaceRecord> {
        let file = self.load_or_bootstrap()?;
        let record = file
            .workspaces
            .into_iter()
            .find(|w| w.name.eq_ignore_ascii_case(&file.active_workspace))
            .ok_or_else(|| error("workspaceNotFound", "Active workspace was not found."))?;
        Ok(Self::with_availability(record))
    }

    /// Registers an existing folder as a local workspace (or activates it if already registered).
    pub fn open_folder(&self, path: PathBuf, name: &str) -> Result<WorkspaceRecord> {
        if !path.is_dir() {
            return Err(error(
                "missingWorkspace",
                "Selected workspace folder does not exist.",
            ));
        }
        let canonical = path.canonicalize()?;
        let canonical_str = canonical.to_string_lossy().into_owned();
        let mut file = self.load_or_bootstrap()?;

        if let Some(existing) = file.workspaces.iter_mut().find(|record| {
            record
                .backing
                .local_path()
                .and_then(|p| Path::new(p).canonicalize().ok())
                .map(|p| p == canonical)
                .unwrap_or(false)
        }) {
            existing.last_opened_at = now_millis();
            existing.available = true;
            let activated = existing.clone();
            file.active_workspace = activated.name.clone();
            self.save(&file)?;
            return Ok(activated);
        }

        let validated_name = Self::validate_unique_name(&file, name, None)?;
        let record = WorkspaceRecord {
            name: validated_name.clone(),
            backing: WorkspaceBacking::Local {
                path: canonical_str,
            },
            last_opened_at: now_millis(),
            available: true,
        };
        file.workspaces.push(record.clone());
        file.active_workspace = validated_name;
        self.save(&file)?;
        Ok(record)
    }

    /// Creates a new directory on disk and registers it as a local workspace.
    pub fn create_folder_workspace(&self, path: PathBuf, name: &str) -> Result<WorkspaceRecord> {
        let mut file = self.load_or_bootstrap()?;
        let validated_name = Self::validate_unique_name(&file, name, None)?;
        fs::create_dir_all(&path)?;
        let canonical = path.canonicalize()?;
        let canonical_str = canonical.to_string_lossy().into_owned();

        if let Some(existing) = file.workspaces.iter_mut().find(|record| {
            record
                .backing
                .local_path()
                .and_then(|p| Path::new(p).canonicalize().ok())
                .map(|p| p == canonical)
                .unwrap_or(false)
        }) {
            existing.last_opened_at = now_millis();
            existing.available = true;
            let activated = existing.clone();
            file.active_workspace = activated.name.clone();
            self.save(&file)?;
            return Ok(activated);
        }

        let record = WorkspaceRecord {
            name: validated_name.clone(),
            backing: WorkspaceBacking::Local {
                path: canonical_str,
            },
            last_opened_at: now_millis(),
            available: true,
        };
        file.workspaces.push(record.clone());
        file.active_workspace = validated_name;
        self.save(&file)?;
        Ok(record)
    }

    /// Switches the active workspace to `name`, checking backing support and local directory existence.
    pub fn switch(&self, name: &str) -> Result<WorkspaceRecord> {
        let mut file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;
        let record = &mut file.workspaces[idx];

        match &record.backing {
            WorkspaceBacking::Remote { .. } => {
                return Err(error(
                    "unsupportedWorkspace",
                    "Online-managed workspaces are not supported yet.",
                ));
            }
            WorkspaceBacking::Local { path } | WorkspaceBacking::Synced { path, .. } => {
                if !Path::new(path).is_dir() {
                    return Err(error(
                        "missingWorkspace",
                        "Workspace folder could not be found on disk.",
                    ));
                }
            }
        }

        record.last_opened_at = now_millis();
        record.available = true;
        let activated = record.clone();
        file.active_workspace = activated.name.clone();
        self.save(&file)?;
        Ok(activated)
    }

    /// Renames a registered workspace and migrates its external UI-state directory.
    pub fn rename(&self, name: &str, new_name: &str) -> Result<WorkspaceRecord> {
        let mut file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;
        let old_name = file.workspaces[idx].name.clone();
        let validated_new = Self::validate_unique_name(&file, new_name, Some(idx))?;

        if old_name != validated_new {
            let old_state_dir = self.workspace_state_dir(&old_name);
            let new_state_dir = self.workspace_state_dir(&validated_new);
            if old_state_dir.exists() {
                if let Some(parent) = new_state_dir.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::rename(&old_state_dir, &new_state_dir)?;
            }
            file.workspaces[idx].name = validated_new.clone();
            if file.active_workspace.eq_ignore_ascii_case(&old_name) {
                file.active_workspace = validated_new;
            }
            self.save(&file)?;
        }

        Ok(Self::with_availability(file.workspaces[idx].clone()))
    }

    /// Updates a local or synced workspace to point to a relocated folder on disk, preserving its name and sync metadata.
    pub fn relocate(&self, name: &str, new_path: PathBuf) -> Result<WorkspaceRecord> {
        if !new_path.is_dir() {
            return Err(error(
                "missingWorkspace",
                "Selected workspace folder does not exist.",
            ));
        }
        let canonical = new_path.canonicalize()?;
        let canonical_str = canonical.to_string_lossy().into_owned();
        let mut file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;

        let duplicate_other = file.workspaces.iter().enumerate().any(|(i, record)| {
            i != idx
                && record
                    .backing
                    .local_path()
                    .and_then(|p| Path::new(p).canonicalize().ok())
                    .map(|p| p == canonical)
                    .unwrap_or(false)
        });
        if duplicate_other {
            return Err(error(
                "nameUnavailable",
                "That folder is already registered as another workspace.",
            ));
        }

        match &mut file.workspaces[idx].backing {
            WorkspaceBacking::Local { path } | WorkspaceBacking::Synced { path, .. } => {
                *path = canonical_str;
            }
            WorkspaceBacking::Remote { .. } => {
                return Err(error(
                    "unsupportedWorkspace",
                    "Online-managed workspaces cannot be relocated.",
                ));
            }
        }
        file.workspaces[idx].last_opened_at = now_millis();
        file.workspaces[idx].available = true;
        file.active_workspace = file.workspaces[idx].name.clone();
        self.save(&file)?;
        Ok(file.workspaces[idx].clone())
    }

    /// Removes a workspace from the registry and deletes its external UI-state directory without touching user files on disk.
    pub fn remove(&self, name: &str) -> Result<WorkspaceRegistrySnapshot> {
        let mut file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;
        let removed = file.workspaces.remove(idx);

        let state_dir = self.workspace_state_dir(&removed.name);
        if state_dir.exists() {
            let _ = fs::remove_dir_all(&state_dir);
        }

        if file.workspaces.is_empty() {
            let default_record = self.bootstrap_default_record()?;
            file.active_workspace = default_record.name.clone();
            file.workspaces.push(default_record);
        } else if file.active_workspace.eq_ignore_ascii_case(&removed.name) {
            let next = file
                .workspaces
                .iter()
                .filter(|w| {
                    Self::is_available(w) && !matches!(w.backing, WorkspaceBacking::Remote { .. })
                })
                .max_by_key(|w| w.last_opened_at)
                .or_else(|| file.workspaces.iter().max_by_key(|w| w.last_opened_at))
                .expect("workspaces is non-empty");
            file.active_workspace = next.name.clone();
        }

        self.save(&file)?;
        Ok(Self::to_snapshot(file))
    }

    /// Reads the persisted UI state for `name`, returning defaults if no state file exists yet.
    pub fn read_ui_state(&self, name: &str) -> Result<WorkspaceUiState> {
        let file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;
        let canonical_name = &file.workspaces[idx].name;
        let state_path = self.workspace_state_path(canonical_name);
        if !state_path.exists() {
            return Ok(WorkspaceUiState::default());
        }
        let bytes = fs::read(&state_path)?;
        serde_json::from_slice(&bytes).map_err(|e| error("io", e.to_string()))
    }

    /// Merges `patch` into the persisted UI state for `name` and writes it atomically.
    pub fn patch_ui_state(
        &self,
        name: &str,
        patch: WorkspaceStatePatch,
    ) -> Result<WorkspaceUiState> {
        let file = self.load_or_bootstrap()?;
        let idx = Self::find_index(&file, name)?;
        let canonical_name = &file.workspaces[idx].name;
        let mut state = self.read_ui_state(canonical_name)?;
        state.apply_patch(patch);
        let state_path = self.workspace_state_path(canonical_name);
        write_json_atomic(&state_path, &state)?;
        Ok(state)
    }

    // Private -----------------------------------------------------------------

    fn app_dir(&self) -> PathBuf {
        self.home.join(".hypertextual")
    }

    fn registry_path(&self) -> PathBuf {
        self.app_dir().join("workspaces.json")
    }

    fn workspace_state_dir(&self, name: &str) -> PathBuf {
        self.app_dir().join("workspaces").join(name)
    }

    fn workspace_state_path(&self, name: &str) -> PathBuf {
        self.workspace_state_dir(name).join("state.json")
    }

    fn load_or_bootstrap(&self) -> Result<RegistryFile> {
        let path = self.registry_path();
        if path.exists() {
            let bytes = fs::read(&path)?;
            let mut file: RegistryFile =
                serde_json::from_slice(&bytes).map_err(|e| error("io", e.to_string()))?;
            if file.workspaces.is_empty() {
                let default_record = self.bootstrap_default_record()?;
                file.active_workspace = default_record.name.clone();
                file.workspaces.push(default_record);
                self.save(&file)?;
            }
            return Ok(file);
        }

        let default_record = self.bootstrap_default_record()?;
        let file = RegistryFile {
            schema_version: 1,
            active_workspace: default_record.name.clone(),
            workspaces: vec![default_record],
        };
        self.save(&file)?;
        Ok(file)
    }

    fn bootstrap_default_record(&self) -> Result<WorkspaceRecord> {
        let root = Workspace::from_home(self.home.clone()).root;
        fs::create_dir_all(&root)?;
        let canonical = root.canonicalize()?;
        Ok(WorkspaceRecord {
            name: DEFAULT_WORKSPACE_NAME.to_owned(),
            backing: WorkspaceBacking::Local {
                path: canonical.to_string_lossy().into_owned(),
            },
            last_opened_at: now_millis(),
            available: true,
        })
    }

    fn save(&self, file: &RegistryFile) -> Result<()> {
        write_json_atomic(&self.registry_path(), file)
    }

    fn find_index(file: &RegistryFile, name: &str) -> Result<usize> {
        file.workspaces
            .iter()
            .position(|w| w.name.eq_ignore_ascii_case(name.trim()))
            .ok_or_else(|| error("workspaceNotFound", "Workspace was not found."))
    }

    fn validate_unique_name(
        file: &RegistryFile,
        name: &str,
        ignore_idx: Option<usize>,
    ) -> Result<String> {
        let trimmed = WorkspaceNode::validate_name(name)?;
        let duplicate = file.workspaces.iter().enumerate().any(|(idx, existing)| {
            Some(idx) != ignore_idx && existing.name.eq_ignore_ascii_case(trimmed)
        });
        if duplicate {
            return Err(error(
                "nameUnavailable",
                "A workspace with this name already exists.",
            ));
        }
        Ok(trimmed.to_owned())
    }

    fn is_available(record: &WorkspaceRecord) -> bool {
        match &record.backing {
            WorkspaceBacking::Local { path } | WorkspaceBacking::Synced { path, .. } => {
                Path::new(path).is_dir()
            }
            WorkspaceBacking::Remote { .. } => false,
        }
    }

    fn with_availability(mut record: WorkspaceRecord) -> WorkspaceRecord {
        record.available = Self::is_available(&record);
        record
    }

    fn to_snapshot(file: RegistryFile) -> WorkspaceRegistrySnapshot {
        WorkspaceRegistrySnapshot {
            active_workspace: file.active_workspace,
            workspaces: file
                .workspaces
                .into_iter()
                .map(Self::with_availability)
                .collect(),
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| error("io", "Target path has no parent directory."))?;
    let mut temp = NamedTempFile::new_in(parent)?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| error("io", e.to_string()))?;
    temp.write_all(&bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path)
        .map_err(|e| error("io", e.error.to_string()))?;
    Ok(())
}
