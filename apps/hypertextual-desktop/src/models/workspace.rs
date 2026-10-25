use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use super::{Document, Entry, ImageAsset, OpenedWorkspace, SavedArticle};
use crate::error::{Result, WorkspaceError, error};

const MAX_BYTES: u64 = 16 * 1024 * 1024;

pub struct Workspace {
    root: PathBuf,
}

impl Workspace {
    pub fn from_home(home: PathBuf) -> Self {
        Self {
            root: home.join(".hypertextual").join("workspace"),
        }
    }

    fn root(&self) -> Result<PathBuf> {
        fs::create_dir_all(&self.root)?;
        Ok(self.root.canonicalize()?)
    }

    fn resolve(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || relative.contains('\\')
            || relative.contains(':')
        {
            return Err(error(
                "outsideWorkspace",
                "Choose a file inside the workspace.",
            ));
        }
        let root = self.root()?;
        let resolved = root.join(path).canonicalize()?;
        if !resolved.starts_with(&root) {
            return Err(error(
                "outsideWorkspace",
                "Links outside the workspace cannot be opened.",
            ));
        }
        Ok(resolved)
    }

    pub(crate) fn open(&self) -> Result<OpenedWorkspace> {
        Ok(OpenedWorkspace {
            root: self.root()?.to_string_lossy().into_owned(),
            entries: self.list("")?,
        })
    }

    pub(crate) fn list(&self, relative: &str) -> Result<Vec<Entry>> {
        let directory = self.resolve(relative)?;
        let root = self.root()?;
        let mut entries = Vec::new();
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| error("invalidName", "A workspace filename is not valid Unicode."))?;
            // Atomic-save temporary files are not articles.
            if name.starts_with(".hypertextual-save-") || name == ".images" {
                continue;
            }
            let path = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            let canonical = entry.path().canonicalize();
            let kind = match canonical {
                Ok(p) if p.starts_with(&root) && p.is_dir() => "directory",
                Ok(p) if p.starts_with(&root) && p.is_file() => "file",
                _ => "unavailable",
            };
            entries.push(Entry { path, name, kind });
        }
        entries.sort_by(|a, b| {
            (a.kind != "directory")
                .cmp(&(b.kind != "directory"))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }

    pub(crate) fn create(&self) -> Result<Entry> {
        let root = self.root()?;
        for number in 1..=10_000 {
            let title = if number == 1 {
                "Untitled".to_owned()
            } else {
                format!("Untitled {number}")
            };
            let name = format!("{title}.md");
            // Exclusive creation also treats existing directories and symlinks as occupied names.
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(root.join(&name))
            {
                Ok(mut file) => {
                    file.write_all(format!("# {title}\n\n").as_bytes())?;
                    file.sync_all()?;
                    return Ok(Entry {
                        path: name.clone(),
                        name,
                        kind: "file",
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            }
        }
        Err(error(
            "nameUnavailable",
            "No available name for a new article.",
        ))
    }

    pub(crate) fn create_folder_in(&self, name: &str, parent: &str) -> Result<Entry> {
        let name = valid_name(name)?;
        fs::create_dir(self.resolve(parent)?.join(name)).map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                error(
                    "nameUnavailable",
                    "A file or folder with this name already exists.",
                )
            } else {
                e.into()
            }
        })?;
        Ok(Entry {
            path: if parent.is_empty() {
                name.to_owned()
            } else {
                format!("{parent}/{name}")
            },
            name: name.to_owned(),
            kind: "directory",
        })
    }

    pub(crate) fn create_file(&self, name: &str, parent: &str) -> Result<Entry> {
        let name = valid_name(name)?;
        let name = if Path::new(name).extension().is_none() {
            format!("{name}.md")
        } else {
            name.to_owned()
        };
        ensure_article(&name)?;
        let title = Path::new(&name).file_stem().unwrap().to_string_lossy();
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.resolve(parent)?.join(&name))?;
        file.write_all(format!("# {title}\n\n").as_bytes())?;
        file.sync_all()?;
        Ok(Entry {
            path: if parent.is_empty() {
                name.clone()
            } else {
                format!("{parent}/{name}")
            },
            name,
            kind: "file",
        })
    }

    pub(crate) fn rename(&self, relative: &str, name: &str) -> Result<Entry> {
        let name = valid_name(name)?;
        let source = self.resolve(relative)?;
        let root = self.root()?;
        // Rename the workspace entry itself; reject symlinks rather than renaming their targets.
        let original = root.join(relative);
        if fs::symlink_metadata(&original)?.file_type().is_symlink() {
            return Err(error("unsupported", "Linked entries cannot be renamed."));
        }
        let kind = if source.is_dir() { "directory" } else { "file" };
        if kind == "file" {
            ensure_article(name)?;
        }
        let target = source.parent().unwrap().join(name);
        if source != target {
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            rustix::fs::renameat_with(
                rustix::fs::CWD,
                &source,
                rustix::fs::CWD,
                &target,
                rustix::fs::RenameFlags::NOREPLACE,
            )
            .map_err(|e| error("io", std::io::Error::from(e).to_string()))?;
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                let source_wide: Vec<u16> =
                    source.as_os_str().encode_wide().chain(Some(0)).collect();
                let target_wide: Vec<u16> =
                    target.as_os_str().encode_wide().chain(Some(0)).collect();
                // SAFETY: Both pointers refer to live, NUL-terminated UTF-16 path buffers.
                let moved = unsafe {
                    windows_sys::Win32::Storage::FileSystem::MoveFileW(
                        source_wide.as_ptr(),
                        target_wide.as_ptr(),
                    )
                };
                if moved == 0 {
                    return Err(std::io::Error::last_os_error().into());
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
            {
                // Fail closed on platforms without an exclusive rename operation.
                return Err(error(
                    "unsupported",
                    "Renaming is not supported on this platform yet.",
                ));
            }
        }
        let path = target
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        Ok(Entry {
            path,
            name: name.to_owned(),
            kind,
        })
    }

    pub(crate) fn delete(&self, relative: &str) -> Result<()> {
        if relative.is_empty() {
            return Err(error(
                "outsideWorkspace",
                "The workspace itself cannot be deleted.",
            ));
        }
        let path = self.resolve(relative)?;
        if fs::symlink_metadata(self.root()?.join(relative))?
            .file_type()
            .is_symlink()
        {
            return Err(error("unsupported", "Linked entries cannot be deleted."));
        }
        trash::delete(path).map_err(|e| error("io", e.to_string()))
    }

    pub(crate) fn save_article(
        &self,
        relative: &str,
        content: &str,
        expected_revision: &str,
        title: &str,
    ) -> Result<SavedArticle> {
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
        let mut entry = Entry {
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
                let target = self.resolve(relative)?.parent().unwrap().join(&name);
                if target.try_exists()? {
                    continue;
                }
                match self.rename(relative, &name) {
                    Ok(renamed) => {
                        entry = renamed;
                        break;
                    }
                    Err(_) if target.try_exists()? => continue,
                    Err(e) => return Err(e),
                }
            }
        }
        Ok(SavedArticle {
            path: entry.path,
            name: entry.name,
            revision,
        })
    }

    pub(crate) fn import_image(&self, article_path: &str, bytes: &[u8]) -> Result<ImageAsset> {
        ensure_article(article_path)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error("tooLarge", "Images must be smaller than 16 MB."));
        }
        let (_, extension) = image_type(bytes)?;
        let article = self.resolve(article_path)?;
        let directory = article.parent().unwrap().join(".images");
        fs::create_dir_all(&directory)?;
        if !directory.canonicalize()?.starts_with(self.root()?) {
            return Err(error(
                "outsideWorkspace",
                "The image folder is outside this workspace.",
            ));
        }
        let name = format!("{}.{}", revision(bytes), extension);
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
                    return Err(error("io", "The image asset name is already in use."));
                }
            }
            Err(e) => return Err(e.into()),
        }
        self.read_image(article_path, &format!(".images/{name}"))
    }

    pub(crate) fn read_image(&self, article_path: &str, source: &str) -> Result<ImageAsset> {
        let source_path = Path::new(source);
        if source.is_empty()
            || source.contains(['\\', ':'])
            || source_path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(error(
                "outsideWorkspace",
                "Choose an image inside the workspace.",
            ));
        }
        let parent = if article_path.is_empty() {
            self.root()?
        } else {
            ensure_article(article_path)?;
            self.resolve(article_path)?.parent().unwrap().to_owned()
        };
        let joined = parent.join(source_path);
        let root = self.root()?;
        let relative = joined
            .strip_prefix(root)
            .map_err(|_| error("outsideWorkspace", "Image is outside the workspace."))?
            .to_string_lossy()
            .into_owned();
        let path = self.resolve(&relative)?;
        if fs::metadata(&path)?.len() > MAX_BYTES {
            return Err(error("tooLarge", "Image is too large."));
        }
        let bytes = fs::read(path)?;
        let (mime, _) = image_type(&bytes)?;
        Ok(ImageAsset {
            source: source.to_owned(),
            url: format!("data:{mime};base64,{}", STANDARD.encode(&bytes)),
        })
    }

    pub(crate) fn read(&self, relative: &str) -> Result<Document> {
        ensure_article(relative)?;
        let path = self.resolve(relative)?;
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
        let revision = revision(&bytes);
        let content = String::from_utf8(bytes)
            .map_err(|_| error("unsupported", "This file is not UTF-8 text."))?;
        if content.contains('\0') {
            return Err(error("unsupported", "This file contains binary data."));
        }
        Ok(Document { content, revision })
    }

    pub(crate) fn write(
        &self,
        relative: &str,
        content: &str,
        expected_revision: &str,
    ) -> Result<String> {
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
        let path = self.resolve(relative)?;
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
        if self.resolve(relative)? != path || self.read(relative)?.revision != expected_revision {
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
        Ok(revision(content.as_bytes()))
    }
}

fn image_type(bytes: &[u8]) -> Result<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok(("image/png", "png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok(("image/jpeg", "jpg"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok(("image/gif", "gif"))
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok(("image/webp", "webp"))
    } else {
        Err(error(
            "unsupported",
            "Choose a PNG, JPEG, GIF, or WebP image.",
        ))
    }
}

fn valid_name(name: &str) -> Result<&str> {
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

fn ensure_article(relative: &str) -> Result<()> {
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

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests;
