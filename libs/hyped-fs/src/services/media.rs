use std::{
    fs,
    io::Write,
    path::{Component, Path},
};

use super::{MAX_BYTES, WorkspaceService};
use crate::{
    error::{Result, error},
    models::{ArticleContent, FileAsset},
};

/// Stores and reads file assets (images, diagrams, media) within one workspace.
pub struct MediaService<'a> {
    /// The workspace boundary used by file asset operations.
    workspace: &'a WorkspaceService,
}

impl<'a> MediaService<'a> {
    /// Uses the supplied workspace for every file asset operation.
    pub fn new(workspace: &'a WorkspaceService) -> Self {
        Self { workspace }
    }

    pub fn import(&self, article_path: &str, bytes: &[u8]) -> Result<FileAsset> {
        ArticleContent::validate_path(article_path)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error("tooLarge", "Files must be smaller than 16 MB."));
        }
        let name = FileAsset::filename(bytes)?;
        let article = self.workspace.resolve(article_path)?;
        let directory = article.parent().unwrap().join(".media");
        fs::create_dir_all(&directory)?;
        if !directory
            .canonicalize()?
            .starts_with(self.workspace.root()?)
        {
            return Err(error(
                "outsideWorkspace",
                "The media folder is outside this workspace.",
            ));
        }
        let path = directory.join(&name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                file.write_all(bytes)?;
                file.sync_all()?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if fs::symlink_metadata(&path)?.file_type().is_symlink()
                    || fs::read(&path)? != bytes
                {
                    return Err(error("io", "The media asset name is already in use."));
                }
            }
            Err(e) => return Err(e.into()),
        }
        self.read(article_path, &format!(".media/{name}"))
    }

    pub fn read(&self, article_path: &str, source: &str) -> Result<FileAsset> {
        let source_path = Path::new(source);
        if source.is_empty()
            || source.contains(['\\', ':'])
            || source_path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(error(
                "outsideWorkspace",
                "Choose a file inside the workspace.",
            ));
        }
        let parent = if article_path.is_empty() {
            self.workspace.root()?
        } else {
            ArticleContent::validate_path(article_path)?;
            self.workspace
                .resolve(article_path)?
                .parent()
                .unwrap()
                .to_owned()
        };
        let joined = parent.join(source_path);
        let root = self.workspace.root()?;
        let relative = joined
            .strip_prefix(root)
            .map_err(|_| error("outsideWorkspace", "File is outside the workspace."))?
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");
        let path = self.workspace.resolve(&relative)?;
        if fs::metadata(&path)?.len() > MAX_BYTES {
            return Err(error("tooLarge", "File is too large."));
        }
        let bytes = fs::read(path)?;
        FileAsset::from_bytes(source, &bytes)
    }
}
