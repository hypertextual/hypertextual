//! Filesystem access stays behind a single, workspace-scoped service.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::State;

const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceError {
    code: &'static str,
    message: String,
}

type Result<T> = std::result::Result<T, WorkspaceError>;

fn error(code: &'static str, message: impl Into<String>) -> WorkspaceError {
    WorkspaceError {
        code,
        message: message.into(),
    }
}

impl From<std::io::Error> for WorkspaceError {
    fn from(value: std::io::Error) -> Self {
        error("io", value.to_string())
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    path: String,
    name: String,
    kind: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkspace {
    root: String,
    entries: Vec<Entry>,
}

#[derive(Serialize)]
pub struct Document {
    pub content: String,
    pub revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedArticle {
    path: String,
    name: String,
    revision: String,
}

#[derive(Serialize)]
pub struct ImageAsset {
    source: String,
    url: String,
}

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

    fn open(&self) -> Result<OpenedWorkspace> {
        Ok(OpenedWorkspace {
            root: self.root()?.to_string_lossy().into_owned(),
            entries: self.list("")?,
        })
    }

    fn list(&self, relative: &str) -> Result<Vec<Entry>> {
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

    fn create(&self) -> Result<Entry> {
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

    #[cfg(test)]
    fn create_folder(&self, name: &str) -> Result<Entry> {
        self.create_folder_in(name, "")
    }

    fn create_folder_in(&self, name: &str, parent: &str) -> Result<Entry> {
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

    fn create_file(&self, name: &str, parent: &str) -> Result<Entry> {
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

    fn rename(&self, relative: &str, name: &str) -> Result<Entry> {
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

    fn delete(&self, relative: &str) -> Result<()> {
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

    fn save_article(
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

    fn import_image(&self, article_path: &str, bytes: &[u8]) -> Result<ImageAsset> {
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

    fn read_image(&self, article_path: &str, source: &str) -> Result<ImageAsset> {
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

    fn read(&self, relative: &str) -> Result<Document> {
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

    fn write(&self, relative: &str, content: &str, expected_revision: &str) -> Result<String> {
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

pub struct WorkspaceService(pub Arc<Mutex<Workspace>>);

async fn run<T: Send + 'static>(
    state: State<'_, WorkspaceService>,
    operation: impl FnOnce(&Workspace) -> Result<T> + Send + 'static,
) -> Result<T> {
    let workspace = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let locked = workspace
            .lock()
            .map_err(|_| error("io", "Workspace service is unavailable."))?;
        operation(&locked)
    })
    .await
    .map_err(|e| error("io", e.to_string()))?
}

#[tauri::command]
pub async fn workspace_open(state: State<'_, WorkspaceService>) -> Result<OpenedWorkspace> {
    run(state, Workspace::open).await
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<Vec<Entry>> {
    run(state, move |w| w.list(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_create(state: State<'_, WorkspaceService>) -> Result<Entry> {
    run(state, Workspace::create).await
}

#[tauri::command]
pub async fn workspace_create_folder(
    state: State<'_, WorkspaceService>,
    name: String,
    parent_path: Option<String>,
) -> Result<Entry> {
    run(state, move |w| {
        w.create_folder_in(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_create_file(
    state: State<'_, WorkspaceService>,
    name: String,
    parent_path: Option<String>,
) -> Result<Entry> {
    run(state, move |w| {
        w.create_file(&name, parent_path.as_deref().unwrap_or(""))
    })
    .await
}

#[tauri::command]
pub async fn workspace_rename(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    name: String,
) -> Result<Entry> {
    run(state, move |w| w.rename(&relative_path, &name)).await
}

#[tauri::command]
pub async fn workspace_delete(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<()> {
    run(state, move |w| w.delete(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_save_article(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    content: String,
    expected_revision: String,
    title: String,
) -> Result<SavedArticle> {
    run(state, move |w| {
        w.save_article(&relative_path, &content, &expected_revision, &title)
    })
    .await
}
#[tauri::command]
pub async fn workspace_import_image(
    state: State<'_, WorkspaceService>,
    article_path: String,
    bytes: Vec<u8>,
) -> Result<ImageAsset> {
    run(state, move |w| w.import_image(&article_path, &bytes)).await
}
#[tauri::command]
pub async fn workspace_read_image(
    state: State<'_, WorkspaceService>,
    article_path: String,
    source: String,
) -> Result<ImageAsset> {
    run(state, move |w| w.read_image(&article_path, &source)).await
}

#[tauri::command]
pub async fn workspace_read(
    state: State<'_, WorkspaceService>,
    relative_path: String,
) -> Result<Document> {
    run(state, move |w| w.read(&relative_path)).await
}

#[tauri::command]
pub async fn workspace_write(
    state: State<'_, WorkspaceService>,
    relative_path: String,
    content: String,
    expected_revision: String,
) -> Result<String> {
    run(state, move |w| {
        w.write(&relative_path, &content, &expected_revision)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_default_workspace_and_lists_real_entries() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        assert!(w.open().unwrap().entries.is_empty());
        assert!(home.path().join(".hypertextual/workspace").is_dir());
        fs::create_dir(w.root.join("Research")).unwrap();
        fs::write(w.root.join("éclair.md"), "# Bonjour").unwrap();
        let entries = w.list("").unwrap();
        assert_eq!(entries[0].name, "Research");
        assert_eq!(entries[1].path, "éclair.md");
        assert!(w.list("Research").unwrap().is_empty());
    }

    #[test]
    fn creates_folders_without_overwriting_or_leaving_workspace() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        let folder = w.create_folder("  Research  ").unwrap();
        assert_eq!(folder.path, "Research");
        assert_eq!(folder.kind, "directory");
        assert!(w.list("Research").unwrap().is_empty());
        assert!(w.create_folder("Research").is_err());
        fs::write(w.root.join("existing.md"), "Keep me").unwrap();
        assert!(w.create_folder("existing.md").is_err());
        assert_eq!(
            fs::read_to_string(w.root.join("existing.md")).unwrap(),
            "Keep me"
        );
        for name in [
            "",
            " ",
            ".",
            "..",
            "../outside",
            "/outside",
            "a/b",
            "a\\b",
            "a:b",
            ".hypertextual-save-hidden",
            "bad\0name",
        ] {
            assert!(w.create_folder(name).is_err(), "{name:?}");
        }
    }

    #[test]
    fn creates_and_renames_nested_entries_exclusively() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        w.create_folder("Drafts").unwrap();
        let file = w.create_file("Hello", "Drafts").unwrap();
        assert_eq!(file.path, "Drafts/Hello.md");
        assert_eq!(w.read(&file.path).unwrap().content, "# Hello\n\n");
        assert!(w.create_file("Hello.md", "Drafts").is_err());
        w.create_folder_in("Nested", "Drafts").unwrap();
        let renamed = w.rename(&file.path, "World.md").unwrap();
        assert_eq!(renamed.path, "Drafts/World.md");
        assert_eq!(w.read(&renamed.path).unwrap().content, "# Hello\n\n");
        w.create_file("Taken.md", "Drafts").unwrap();
        assert!(w.rename(&renamed.path, "Taken.md").is_err());
        assert!(w.rename("Drafts", "..").is_err());
        assert!(w.create_file("../escape.md", "Drafts").is_err());
        assert!(w.create_folder_in("Escape", "../").is_err());
        assert!(w.delete("").is_err());
        assert!(w.delete("../outside").is_err());
        let folder = w.rename("Drafts", "Renamed").unwrap();
        assert_eq!(folder.path, "Renamed");
        assert!(w.read("Renamed/World.md").is_ok());
    }

    #[test]
    fn saves_heading_as_filename_without_overwriting_and_keeps_images_colocated() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        w.create_folder("Drafts").unwrap();
        let entry = w.create_file("Untitled.md", "Drafts").unwrap();
        w.create_file("New title.md", "Drafts").unwrap();
        let read = w.read(&entry.path).unwrap();
        let saved = w
            .save_article(&entry.path, "# New title\n", &read.revision, "New title ")
            .unwrap();
        assert_eq!(saved.path, "Drafts/New title 2.md");
        assert_eq!(w.read(&saved.path).unwrap().content, "# New title\n");
        assert!(!w.root.join(&entry.path).exists());
        assert_eq!(
            w.read("Drafts/New title.md").unwrap().content,
            "# New title\n\n"
        );
        let bytes = b"\x89PNG\r\n\x1a\nimage bytes";
        let image = w.import_image(&saved.path, bytes).unwrap();
        assert!(image.source.starts_with(".images/"));
        assert!(image.url.starts_with("data:image/png;base64,"));
        assert_eq!(
            fs::read(w.root.join("Drafts").join(&image.source)).unwrap(),
            bytes
        );
        assert_eq!(
            w.import_image(&saved.path, bytes).unwrap().source,
            image.source
        );
        assert!(
            w.list("Drafts")
                .unwrap()
                .iter()
                .all(|e| e.name != ".images")
        );
        assert!(w.import_image(&saved.path, b"not an image").is_err());
        assert!(w.read_image(&saved.path, "../escape.png").is_err());
        assert!(w.read_image(&saved.path, "/escape.png").is_err());
        w.rename("Drafts", "Renamed folder").unwrap();
        assert_eq!(
            w.read_image("Renamed folder/New title 2.md", &image.source)
                .unwrap()
                .url,
            image.url
        );
    }

    #[test]
    fn creates_articles_without_overwriting_existing_entries() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        let first = w.create().unwrap();
        assert_eq!(first.path, "Untitled.md");
        assert_eq!(w.read(&first.path).unwrap().content, "# Untitled\n\n");
        fs::write(w.root.join("Untitled.md"), "Keep this article").unwrap();
        fs::create_dir(w.root.join("Untitled 2.md")).unwrap();
        let next = w.create().unwrap();
        assert_eq!(next.path, "Untitled 3.md");
        assert_eq!(w.read("Untitled.md").unwrap().content, "Keep this article");
        assert_eq!(w.read(&next.path).unwrap().content, "# Untitled 3\n\n");
    }

    #[test]
    fn autosave_persists_source_and_rejects_external_changes() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        w.open().unwrap();
        for name in ["article.md", "article.htmd"] {
            fs::write(w.root.join(name), "# Original\n").unwrap();
            let read = w.read(name).unwrap();
            let updated = w.write(name, "# Edited\n", &read.revision).unwrap();
            assert_eq!(w.read(name).unwrap().content, "# Edited\n");
            assert_ne!(updated, read.revision);
            assert_eq!(
                w.write(name, "# Edited\n", &read.revision).unwrap(),
                updated
            );
            fs::write(w.root.join(name), "External edit").unwrap();
            assert_eq!(
                w.write(name, "Local edit", &updated).unwrap_err().code,
                "conflict"
            );
            assert_eq!(
                fs::read_to_string(w.root.join(name)).unwrap(),
                "External edit"
            );
        }
        assert_eq!(w.list("").unwrap().len(), 2);
    }

    #[test]
    fn rejects_traversal_missing_binary_and_unsupported_files() {
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        w.open().unwrap();
        for path in ["../outside.md", "/tmp/outside.md", "C:\\outside.md"] {
            assert_eq!(w.resolve(path).unwrap_err().code, "outsideWorkspace");
        }
        assert!(w.read("missing.md").is_err());
        fs::write(w.root.join("binary.md"), [0xff]).unwrap();
        assert_eq!(w.read("binary.md").err().unwrap().code, "unsupported");
        assert_eq!(w.read("image.png").err().unwrap().code, "unsupported");
        fs::write(w.root.join("nul.md"), "binary\0data").unwrap();
        assert_eq!(w.read("nul.md").err().unwrap().code, "unsupported");
        let large = fs::File::create(w.root.join("large.md")).unwrap();
        large.set_len(MAX_BYTES + 1).unwrap();
        assert_eq!(w.read("large.md").err().unwrap().code, "tooLarge");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_escaped_symlinks_and_retains_file_permissions() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let home = tempfile::tempdir().unwrap();
        let w = Workspace::from_home(home.path().to_owned());
        w.open().unwrap();
        fs::write(home.path().join("outside.md"), "Outside").unwrap();
        symlink(home.path().join("outside.md"), w.root.join("link.md")).unwrap();
        assert_eq!(w.read("link.md").err().unwrap().code, "outsideWorkspace");
        assert_eq!(w.list("").unwrap()[0].kind, "unavailable");
        let path = w.root.join("article.md");
        fs::write(&path, "Original").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        w.write(
            "article.md",
            "Edited",
            &w.read("article.md").unwrap().revision,
        )
        .unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        fs::set_permissions(&path, fs::Permissions::from_mode(0o440)).unwrap();
        assert_eq!(
            w.write("article.md", "No", &w.read("article.md").unwrap().revision)
                .unwrap_err()
                .code,
            "readOnly"
        );
    }
}
