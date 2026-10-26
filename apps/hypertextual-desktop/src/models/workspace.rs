use crate::error::{Result, error};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

/// The location of a local article workspace.
pub struct Workspace {
    /// The directory that contains the workspace files.
    pub(crate) root: PathBuf,
}

impl Workspace {
    /// Builds the default workspace location without accessing the filesystem.
    pub(crate) fn from_home(home: PathBuf) -> Self {
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
    pub(crate) root: String,
    /// The visible entries directly inside the workspace.
    pub(crate) entries: Vec<WorkspaceNode>,
}

/// A file or folder listed in the workspace.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    /// The path relative to the workspace root.
    pub(crate) path: String,
    /// The file or folder name, including any extension.
    pub(crate) name: String,
    /// The entry type: `directory`, `file`, or `unavailable`.
    pub(crate) kind: &'static str,
}

impl WorkspaceNode {
    /// Trims a name and rejects names that cannot identify one workspace entry.
    pub(crate) fn validate_name(name: &str) -> Result<&str> {
        let name = name.trim();
        let mut components = Path::new(name).components();
        if name.is_empty()
            || name.contains(['/', '\\', ':', '\0'])
            || !matches!(components.next(), Some(Component::Normal(_)))
            || components.next().is_some()
            || name.starts_with(".hypertextual-save-")
        {
            return Err(error(
                "invalidName",
                "Enter a name without slashes or colons.",
            ));
        }
        Ok(name)
    }
}
