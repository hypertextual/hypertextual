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
}
