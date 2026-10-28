use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

use super::{MAX_BYTES, WorkspaceService};
use crate::{
    error::{Result, WorkspaceError, error},
    models::{ArticleContent, ArticleMetadata, WorkspaceNode},
};

/// Creates, reads, and saves articles within one workspace.
pub struct ArticleService<'a> {
    /// The workspace boundary used by article operations.
    workspace: &'a WorkspaceService,
}

impl<'a> ArticleService<'a> {
    /// Uses the supplied workspace for every article operation.
    pub fn new(workspace: &'a WorkspaceService) -> Self {
        Self { workspace }
    }

    pub fn create(&self) -> Result<WorkspaceNode> {
        let root = self.workspace.root()?;
        for number in 1..=10_000 {
            let title = if number == 1 {
                "Untitled".to_owned()
            } else {
                format!("Untitled {number}")
            };
            let name = format!("{title}.md");
            let path = root.join(&name);
            // Exclusive creation also treats existing directories and symlinks as occupied names.
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(mut file) => {
                    file.write_all(format!("# {title}\n\n").as_bytes())?;
                    file.sync_all()?;
                    return Ok(WorkspaceNode {
                        path: name.clone(),
                        name,
                        kind: "file",
                    });
                }
                // Windows can report AccessDenied when a directory occupies the name.
                Err(e)
                    if e.kind() == std::io::ErrorKind::AlreadyExists
                        || fs::symlink_metadata(&path).is_ok() =>
                {
                    continue;
                }
                Err(e) => return Err(e.into()),
            }
        }
        Err(error(
            "nameUnavailable",
            "No available name for a new article.",
        ))
    }

    pub fn create_file(&self, name: &str, parent: &str) -> Result<WorkspaceNode> {
        let name = WorkspaceNode::validate_name(name)?;
        let name = if Path::new(name).extension().is_none() {
            format!("{name}.md")
        } else {
            name.to_owned()
        };
        ArticleContent::validate_path(&name)?;
        let title = Path::new(&name).file_stem().unwrap().to_string_lossy();
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.workspace.resolve(parent)?.join(&name))?;
        file.write_all(format!("# {title}\n\n").as_bytes())?;
        file.sync_all()?;
        Ok(WorkspaceNode {
            path: if parent.is_empty() {
                name.clone()
            } else {
                format!("{parent}/{name}")
            },
            name,
            kind: "file",
        })
    }

    pub fn save(
        &self,
        relative: &str,
        content: &str,
        expected_revision: &str,
        title: &str,
    ) -> Result<ArticleMetadata> {
        let revision = self.write(relative, content, expected_revision)?;
        let stem: String = title
            .chars()
            .map(|c| {
                if c.is_control() || "/\\:*?\"<>|".contains(c) {
                    '-'
                } else {
                    c
                }
            })
            .collect();
        let stem = stem.trim().trim_matches('.').trim();
        let current = Path::new(relative);
        let extension = current.extension().unwrap().to_string_lossy();
        let mut entry = WorkspaceNode {
            path: relative.to_owned(),
            name: current.file_name().unwrap().to_string_lossy().into_owned(),
            kind: "file",
        };
        if !stem.is_empty() {
            for n in 1..=10_000 {
                let suffix = if n == 1 {
                    String::new()
                } else {
                    format!(" {n}")
                };
                let name = format!("{stem}{suffix}.{extension}");
                if name == entry.name {
                    break;
                }
                let target = self
                    .workspace
                    .resolve(relative)?
                    .parent()
                    .unwrap()
                    .join(&name);
                if target.try_exists()? {
                    continue;
                }
                match self.workspace.rename(relative, &name) {
                    Ok(renamed) => {
                        entry = renamed;
                        break;
                    }
                    Err(_) if target.try_exists()? => continue,
                    Err(e) => return Err(e),
                }
            }
        }
        Ok(ArticleMetadata {
            path: entry.path,
            name: entry.name,
            revision,
        })
    }

    pub fn read(&self, relative: &str) -> Result<ArticleContent> {
        ArticleContent::validate_path(relative)?;
        let path = self.workspace.resolve(relative)?;
        if !fs::metadata(&path)?.is_file() {
            return Err(error("unsupported", "Choose a Markdown or HTMD file."));
        }
        let mut file = fs::File::open(path)?;
        if !file.metadata()?.is_file() {
            return Err(error("unsupported", "Choose a Markdown or HTMD file."));
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error(
                "tooLarge",
                "This article is larger than the 16 MB editing limit.",
            ));
        }
        ArticleContent::from_bytes(bytes)
    }

    pub fn write(&self, relative: &str, content: &str, expected_revision: &str) -> Result<String> {
        if content.len() as u64 > MAX_BYTES {
            return Err(error(
                "tooLarge",
                "This article exceeds the 16 MB editing limit.",
            ));
        }
        let before = self.read(relative)?;
        if before.revision != expected_revision {
            // A previous write can succeed even when its response is lost.
            if before.content == content {
                return Ok(before.revision);
            }
            return Err(error(
                "conflict",
                "This file changed outside Hypertextual. Your draft is retained; copy it before reloading the file.",
            ));
        }
        let path = self.workspace.resolve(relative)?;
        let metadata = fs::metadata(&path)?;
        if metadata.permissions().readonly() {
            return Err(error(
                "readOnly",
                "This file is read-only. Your draft is retained.",
            ));
        }
        let parent = path
            .parent()
            .ok_or_else(|| error("outsideWorkspace", "Invalid file location."))?;
        let mut temporary = tempfile::Builder::new()
            .prefix(".hypertextual-save-")
            .tempfile_in(parent)?;
        temporary.write_all(content.as_bytes())?;
        temporary
            .as_file()
            .set_permissions(metadata.permissions())?;
        temporary.as_file().sync_all()?;
        // Check again immediately before replacement; other in-app writes are serialized.
        if self.workspace.resolve(relative)? != path
            || self.read(relative)?.revision != expected_revision
        {
            return Err(error(
                "conflict",
                "This file changed during saving. Your draft is retained.",
            ));
        }
        temporary
            .persist(&path)
            .map_err(|e| WorkspaceError::from(e.error))?;
        #[cfg(unix)]
        fs::File::open(parent)?.sync_all()?;
        Ok(ArticleContent::revision_for(content.as_bytes()))
    }
}
