//! Tauri commands serialize filesystem operations across native services.
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::{
    error::{Result, error},
    models::{ArticleContent, ArticleMetadata, Entry, ImageAsset, WorkspaceListing},
    services::{ArticleService, MediaService, WorkspaceService},
};

/// Shared workspace access for Tauri command handlers.
pub struct WorkspaceState(pub Arc<Mutex<WorkspaceService>>);

async fn run<T: Send + 'static>(
    state: State<'_, WorkspaceState>,
    operation: impl FnOnce(&WorkspaceService) -> Result<T> + Send + 'static,
) -> Result<T> {
    let workspace = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let locked = workspace
            .lock()
            .map_err(|_| error("io", "Workspace service is unavailable."))?;
        operation(&locked)
    })
    .await
    .map_err(|e| error("io", e.to_string()))?
}

#[tauri::command]
pub async fn workspace_open(state: State<'_, WorkspaceState>) -> Result<WorkspaceListing> {
    run(state, WorkspaceService::open).await
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<Vec<Entry>> {
    run(state, move |w| w.list(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_create(state: State<'_, WorkspaceState>) -> Result<Entry> {
    run(state, |w| ArticleService::new(w).create()).await
}

#[tauri::command]
pub async fn workspace_create_folder(
    state: State<'_, WorkspaceState>,
    name: String,
    parent_path: Option<String>,
) -> Result<Entry> {
    run(state, move |w| {
        w.create_folder_in(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_create_file(
    state: State<'_, WorkspaceState>,
    name: String,
    parent_path: Option<String>,
) -> Result<Entry> {
    run(state, move |w| {
        ArticleService::new(w).create_file(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_rename(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    name: String,
) -> Result<Entry> {
    run(state, move |w| w.rename(&relative_path, &name)).await
}

#[tauri::command]
pub async fn workspace_delete(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<()> {
    run(state, move |w| w.delete(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_save_article(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    content: String,
    expected_revision: String,
    title: String,
) -> Result<ArticleMetadata> {
    run(state, move |w| {
        ArticleService::new(w).save(&relative_path, &content, &expected_revision, &title)
    })
    .await
}
#[tauri::command]
pub async fn workspace_import_image(
    state: State<'_, WorkspaceState>,
    article_path: String,
    bytes: Vec<u8>,
) -> Result<ImageAsset> {
    run(state, move |w| {
        MediaService::new(w).import(&article_path, &bytes)
    })
    .await
}
#[tauri::command]
pub async fn workspace_read_image(
    state: State<'_, WorkspaceState>,
    article_path: String,
    source: String,
) -> Result<ImageAsset> {
    run(state, move |w| {
        MediaService::new(w).read(&article_path, &source)
    })
    .await
}

#[tauri::command]
pub async fn workspace_read(
    state: State<'_, WorkspaceState>,
    relative_path: String,
) -> Result<ArticleContent> {
    run(state, move |w| ArticleService::new(w).read(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_write(
    state: State<'_, WorkspaceState>,
    relative_path: String,
    content: String,
    expected_revision: String,
) -> Result<String> {
    run(state, move |w| {
        ArticleService::new(w).write(&relative_path, &content, &expected_revision)
    })
    .await
}
