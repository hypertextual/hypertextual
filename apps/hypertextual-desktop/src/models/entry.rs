use crate::error::{Result, error};
use serde::Serialize;
use std::path::{Component, Path};

/// A file or folder listed in the workspace.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// The path relative to the workspace root.
    pub(crate) path: String,
    /// The file or folder name, including any extension.
    pub(crate) name: String,
    /// The entry type: `directory`, `file`, or `unavailable`.
    pub(crate) kind: &'static str,
}

impl Entry {
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
