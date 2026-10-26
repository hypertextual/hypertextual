use crate::error::{Result, error};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

/// An article's text and the version read from disk.
#[derive(Serialize)]
pub struct ArticleContent {
    /// The article text read from disk.
    pub content: String,
    /// A content hash used to detect changes before saving.
    pub revision: String,
}

/// An article's location and version after saving.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMetadata {
    /// The saved path relative to the workspace root.
    pub(crate) path: String,
    /// The saved filename, including its extension.
    pub(crate) name: String,
    /// A content hash used to detect changes before the next save.
    pub(crate) revision: String,
}

impl ArticleContent {
    /// Builds article content from UTF-8 bytes and rejects binary data.
    pub(crate) fn from_bytes(bytes: Vec<u8>) -> Result<Self> {
        let revision = Self::revision_for(&bytes);
        let content = String::from_utf8(bytes)
            .map_err(|_| error("unsupported", "This file is not UTF-8 text."))?;
        if content.contains('\0') {
            return Err(error("unsupported", "This file contains binary data."));
        }
        Ok(Self { content, revision })
    }

    /// Rejects paths without a Markdown or HTMD extension.
    pub(crate) fn validate_path(relative: &str) -> Result<()> {
        let extension = Path::new(relative)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if extension != "md" && extension != "htmd" {
            return Err(error(
                "unsupported",
                "Only .md and .htmd articles can be edited.",
            ));
        }
        Ok(())
    }

    /// Hashes content to identify its version.
    pub(crate) fn revision_for(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }
}
