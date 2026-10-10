use htmd_vault::{Block, Document, Entry, Vault, blocks};

#[tauri::command]
fn benchmark_enabled() -> bool {
    std::env::var("HTMD_BENCH").as_deref() == Ok("1")
}

#[tauri::command]
fn tree(vault: tauri::State<Vault>) -> Result<Vec<Entry>, String> {
    vault.tree().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_note(path: String, vault: tauri::State<Vault>) -> Result<Document, String> {
    vault.open(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn parse_blocks(source: String) -> Vec<Block> {
    blocks(&source)
}

#[tauri::command]
fn save_note(
    path: String,
    expected: String,
    source: String,
    vault: tauri::State<Vault>,
) -> Result<(), String> {
    vault
        .save(&path, &expected, &source)
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(Vault::from_env().expect("open vault (set HTMD_VAULT to override)"))
        .invoke_handler(tauri::generate_handler![
            benchmark_enabled,
            tree,
            open_note,
            parse_blocks,
            save_note
        ])
        .run(tauri::generate_context!())
        .expect("run Tauri application");
}
