mod error;
mod models;
mod services;
mod workspace;

use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, Manager};

#[derive(Default)]
struct FrontendReady(AtomicBool);

#[tauri::command]
fn workspace_frontend_ready(state: tauri::State<'_, FrontendReady>) {
    state.0.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn workspace_finish_quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// Construct the app; an explicit home is used by the isolated desktop smoke harness.
pub fn builder(workspace_home: Option<std::path::PathBuf>) -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .manage(FrontendReady::default())
        .setup(move |app| {
            let home = match workspace_home {
                Some(home) => home,
                None => app.path().home_dir()?,
            };
            app.manage(workspace::WorkspaceState(Arc::new(Mutex::new(
                services::WorkspaceService::from_home(home),
            ))));
            Ok(())
        })
        .invoke_handler(commands)
}

/// Shared command dispatch for the app and the native integration harness.
pub fn commands(invoke: tauri::ipc::Invoke) -> bool {
    let handler: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
        workspace::workspace_open,
        workspace::workspace_list,
        workspace::workspace_read,
        workspace::workspace_create,
        workspace::workspace_create_folder,
        workspace::workspace_create_file,
        workspace::workspace_rename,
        workspace::workspace_delete,
        workspace::workspace_write,
        workspace::workspace_save_article,
        workspace::workspace_import_image,
        workspace::workspace_read_image,
        workspace_frontend_ready,
        workspace_finish_quit,
    ];
    handler(invoke)
}

/// User-requested quit waits for the frontend to drain its autosave queue.
pub fn handle_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested {
        code: None, api, ..
    } = event
    {
        if app.state::<FrontendReady>().0.load(Ordering::Relaxed)
            && !app.webview_windows().is_empty()
        {
            api.prevent_exit();
            let _ = app.emit("workspace-quit-requested", ());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    builder(None)
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(handle_event);
}
