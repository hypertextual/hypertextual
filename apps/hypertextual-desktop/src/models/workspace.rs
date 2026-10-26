use serde::Serialize;
use std::path::PathBuf;

use super::Entry;

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
    pub(crate) entries: Vec<Entry>,
}
