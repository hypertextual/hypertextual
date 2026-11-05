use crate::error::{Result, error};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

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
}

/// The workspace location and its top-level entries.
#[derive(Serialize)]
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
