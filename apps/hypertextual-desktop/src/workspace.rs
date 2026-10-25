//! Tauri commands serialize access to the workspace model.
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::{
    error::{Result, error},
    models::{Document, Entry, ImageAsset, OpenedWorkspace, SavedArticle, Workspace},
};

pub struct WorkspaceService(pub Arc<Mutex<Workspace>>);

async fn run<T: Send + 'static>(
    state: State<'_, WorkspaceService>,
    operation: impl FnOnce(&Workspace) -> Result<T> + Send + 'static,
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
pub async fn workspace_open(state: State<'_, WorkspaceService>) -> Result<OpenedWorkspace> {
    run(state, Workspace::open).await
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<Vec<Entry>> {
    run(state, move |w| w.list(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_create(state: State<'_, WorkspaceService>) -> Result<Entry> {
    run(state, Workspace::create).await
}

#[tauri::command]
pub async fn workspace_create_folder(
    state: State<'_, WorkspaceService>,
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
    state: State<'_, WorkspaceService>,
    name: String,
    parent_path: Option<String>,
) -> Result<Entry> {
    run(state, move |w| {
        w.create_file(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_rename(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    name: String,
) -> Result<Entry> {
    run(state, move |w| w.rename(&relative_path, &name)).await
}

#[tauri::command]
pub async fn workspace_delete(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<()> {
    run(state, move |w| w.delete(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_save_article(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    content: String,
    expected_revision: String,
    title: String,
) -> Result<SavedArticle> {
    run(state, move |w| {
        w.save_article(&relative_path, &content, &expected_revision, &title)
    })
    .await
}
#[tauri::command]
pub async fn workspace_import_image(
    state: State<'_, WorkspaceService>,
    article_path: String,
    bytes: Vec<u8>,
) -> Result<ImageAsset> {
    run(state, move |w| w.import_image(&article_path, &bytes)).await
}
#[tauri::command]
pub async fn workspace_read_image(
    state: State<'_, WorkspaceService>,
    article_path: String,
    source: String,
) -> Result<ImageAsset> {
    run(state, move |w| w.read_image(&article_path, &source)).await
}

#[tauri::command]
pub async fn workspace_read(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<Document> {
    run(state, move |w| w.read(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_write(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    content: String,
    expected_revision: String,
) -> Result<String> {
    run(state, move |w| {
        w.write(&relative_path, &content, &expected_revision)
    })
    .await
}
