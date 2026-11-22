//! Tauri commands serialize filesystem operations across native services.
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use hyped_fs::{
    ArticleContent, ArticleMetadata, ArticleService, FileAsset, MediaService, Result,
    WorkspaceListing, WorkspaceNode, WorkspaceRecord, WorkspaceRegistry, WorkspaceRegistrySnapshot,
    WorkspaceService, WorkspaceStatePatch, WorkspaceUiState, error,
};
use serde::Serialize;
use tauri::State;

/// Combined workspace open payload returning the active record, root listing, and persisted UI state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOpenResult {
    /// Active workspace metadata record.
    pub workspace: WorkspaceRecord,
    /// Canonical absolute path to the workspace directory.
    pub root: String,
    /// Top-level visible entries in the workspace.
    pub entries: Vec<WorkspaceNode>,
    /// Persisted UI state for this workspace.
    pub ui_state: WorkspaceUiState,
}

/// Native host state pairing the global workspace registry with the active workspace service.
pub struct WorkspaceHost {
    /// Global markerless workspace registry under `~/.hypertextual/`.
    registry: WorkspaceRegistry,
    /// Active workspace filesystem service confined to the active workspace root.
    active: WorkspaceService,
}

impl WorkspaceHost {
    /// Constructs a host rooted at the supplied home directory.
    pub fn from_home(home: PathBuf) -> Self {
        let registry = WorkspaceRegistry::from_home(home.clone());
        let active = registry
            .active()
            .ok()
            .and_then(|record| record.backing.local_path().map(PathBuf::from))
            .map(WorkspaceService::from_root)
            .unwrap_or_else(|| WorkspaceService::from_home(home));
        Self { registry, active }
    }

    /// Activates `record` in memory and returns its root listing and persisted UI state.
    fn open_record(&mut self, record: WorkspaceRecord) -> Result<WorkspaceOpenResult> {
        let path = record.backing.local_path().ok_or_else(|| {
            error(
                "unsupportedWorkspace",
                "Online-managed workspaces are not supported yet.",
            )
        })?;
        let service = WorkspaceService::from_root(PathBuf::from(path));
        let WorkspaceListing { root, entries } = service.open()?;
        let ui_state = self.registry.read_ui_state(&record.name)?;
        self.active = service;
        Ok(WorkspaceOpenResult {
            workspace: record,
            root,
            entries,
            ui_state,
        })
    }

    /// Refreshes `self.active` to match the registry's current active workspace when available.
    fn sync_active_service(&mut self) {
        if let Ok(record) = self.registry.active()
            && let Some(path) = record.backing.local_path()
        {
            self.active = WorkspaceService::from_root(PathBuf::from(path));
        }
    }
}

/// Shared workspace access for Tauri command handlers.
pub struct WorkspaceState(
    /// The shared Hypertextual host guarded across all Tauri file and registry commands.
    pub Arc<Mutex<WorkspaceHost>>,
);

async fn run<T: Send + 'static>(
    state: State<'_, WorkspaceState>,
    operation: impl FnOnce(&mut WorkspaceHost) -> Result<T> + Send + 'static,
) -> Result<T> {
    let host = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut locked = host
            .lock()
            .map_err(|_| error("io", "Workspace service is unavailable."))?;
        operation(&mut locked)
    })
    .await
    .map_err(|e| error("io", e.to_string()))?
}

#[tauri::command]
pub async fn workspace_open(state: State<'_, WorkspaceState>) -> Result<WorkspaceOpenResult> {
    run(state, |host| {
        let active = host.registry.active()?;
        host.open_record(active)
    })
    .await
}

#[tauri::command]
pub async fn workspace_list_all(
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceRegistrySnapshot> {
    run(state, |host| host.registry.list()).await
}

#[tauri::command]
pub async fn workspace_pick_folder(title: Option<String>) -> Result<Option<String>> {
    let mut dialog = rfd::AsyncFileDialog::new();
    if let Some(title) = title.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        dialog = dialog.set_title(title);
    }
    Ok(dialog
        .pick_folder()
        .await
        .map(|folder| folder.path().to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn workspace_open_folder(
    state: State<'_, WorkspaceState>,
    path: String,
    name: String,
) -> Result<WorkspaceOpenResult> {
    run(state, move |host| {
        let path_buf = PathBuf::from(path);
        // Validate that the folder is readable before mutating the workspace registry.
        let service = WorkspaceService::from_root(path_buf.clone());
        let WorkspaceListing { root, entries } = service.open()?;
        let record = host.registry.open_folder(path_buf, &name)?;
        let ui_state = host.registry.read_ui_state(&record.name)?;
        host.active = service;
        Ok(WorkspaceOpenResult {
            workspace: record,
            root,
            entries,
            ui_state,
        })
    })
    .await
}

#[tauri::command]
pub async fn workspace_create_workspace(
    state: State<'_, WorkspaceState>,
    path: String,
    name: String,
) -> Result<WorkspaceOpenResult> {
    run(state, move |host| {
        let record = host
            .registry
            .create_folder_workspace(PathBuf::from(path), &name)?;
        host.open_record(record)
    })
    .await
}

#[tauri::command]
pub async fn workspace_switch(
    state: State<'_, WorkspaceState>,
    name: String,
) -> Result<WorkspaceOpenResult> {
    run(state, move |host| {
        let record = host.registry.switch(&name)?;
        host.open_record(record)
    })
    .await
}

#[tauri::command]
pub async fn workspace_rename_workspace(
    state: State<'_, WorkspaceState>,
    name: String,
    new_name: String,
) -> Result<WorkspaceRecord> {
    run(state, move |host| host.registry.rename(&name, &new_name)).await
}

#[tauri::command]
pub async fn workspace_relocate(
    state: State<'_, WorkspaceState>,
    name: String,
    path: String,
) -> Result<WorkspaceOpenResult> {
    run(state, move |host| {
        let path_buf = PathBuf::from(path);
        // Validate that the relocated folder is readable before updating the registry.
        let service = WorkspaceService::from_root(path_buf.clone());
        let WorkspaceListing { root, entries } = service.open()?;
        let record = host.registry.relocate(&name, path_buf)?;
        let ui_state = host.registry.read_ui_state(&record.name)?;
        host.active = service;
        Ok(WorkspaceOpenResult {
            workspace: record,
            root,
            entries,
            ui_state,
        })
    })
    .await
}

#[tauri::command]
pub async fn workspace_remove(
    state: State<'_, WorkspaceState>,
    name: String,
) -> Result<WorkspaceRegistrySnapshot> {
    run(state, move |host| {
        let snapshot = host.registry.remove(&name)?;
        host.sync_active_service();
        Ok(snapshot)
    })
    .await
}

#[tauri::command]
pub async fn workspace_patch_ui_state(
    state: State<'_, WorkspaceState>,
    name: String,
    patch: WorkspaceStatePatch,
) -> Result<WorkspaceUiState> {
    run(state, move |host| {
        host.registry.patch_ui_state(&name, patch)
    })
    .await
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<Vec<WorkspaceNode>> {
    run(state, move |host| host.active.list(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_create(state: State<'_, WorkspaceState>) -> Result<WorkspaceNode> {
    run(state, |host| ArticleService::new(&host.active).create()).await
}

#[tauri::command]
pub async fn workspace_create_folder(
    state: State<'_, WorkspaceState>,
    name: String,
    parent_path: Option<String>,
) -> Result<WorkspaceNode> {
    run(state, move |host| {
        host.active
            .create_folder_in(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_create_file(
    state: State<'_, WorkspaceState>,
    name: String,
    parent_path: Option<String>,
) -> Result<WorkspaceNode> {
    run(state, move |host| {
        ArticleService::new(&host.active).create_file(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_rename(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    name: String,
) -> Result<WorkspaceNode> {
    run(state, move |host| host.active.rename(&relative_path, &name)).await
}

#[tauri::command]
pub async fn workspace_delete(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<()> {
    run(state, move |host| host.active.delete(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_open_default_app(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<()> {
    run(state, move |host| {
        host.active.open_in_default_app(&relative_path)
    })
    .await
}

#[tauri::command]
pub async fn workspace_save_article(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    content: String,
    expected_revision: String,
    title: String,
) -> Result<ArticleMetadata> {
    run(state, move |host| {
        ArticleService::new(&host.active).save(&relative_path, &content, &expected_revision, &title)
    })
    .await
}

#[tauri::command]
pub async fn workspace_import_file_asset(
    state: State<'_, WorkspaceState>,
    article_path: String,
    bytes: Vec<u8>,
    filename: Option<String>,
) -> Result<FileAsset> {
    run(state, move |host| {
        MediaService::new(&host.active).import(&article_path, &bytes, filename.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn workspace_read_file_asset(
    state: State<'_, WorkspaceState>,
    article_path: String,
    source: String,
) -> Result<FileAsset> {
    run(state, move |host| {
        MediaService::new(&host.active).read(&article_path, &source)
    })
    .await
}

#[tauri::command]
pub async fn workspace_read(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<ArticleContent> {
    run(state, move |host| {
        ArticleService::new(&host.active).read(&relative_path)
    })
    .await
}

#[tauri::command]
pub async fn workspace_write(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    content: String,
    expected_revision: String,
) -> Result<String> {
    run(state, move |host| {
        ArticleService::new(&host.active).write(&relative_path, &content, &expected_revision)
    })
    .await
}
