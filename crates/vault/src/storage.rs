use crate::{Document, blocks};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub children: Vec<Entry>,
}

#[derive(Clone)]
pub struct Vault {
    root: PathBuf,
}

impl Vault {
    pub fn new(root: impl AsRef<Path>) -> Result<Self> {
        let root = root
            .as_ref()
            .canonicalize()
            .context("Vault does not exist")?;
        if !root.is_dir() {
            bail!("Vault must be a directory");
        }
        Ok(Self { root })
    }

    pub fn from_env() -> Result<Self> {
        Self::new(
            std::env::var_os("HTMD_VAULT")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../vault")),
        )
    }

    pub fn tree(&self) -> Result<Vec<Entry>> {
        self.walk(&self.root)
    }

    fn walk(&self, dir: &Path) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let kind = entry.file_type()?;
            let path = entry.path();
            // Symlinks are deliberately omitted, including directory loops.
            if kind.is_symlink() || (!kind.is_dir() && !supported(&path)) {
                continue;
            }
            entries.push(Entry {
                name: entry.file_name().to_string_lossy().into(),
                path: path.strip_prefix(&self.root)?.to_string_lossy().into(),
                directory: kind.is_dir(),
                children: if kind.is_dir() {
                    self.walk(&path)?
                } else {
                    vec![]
                },
            });
        }
        entries.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(entries)
    }

    fn resolve(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || !supported(path)
        {
            bail!("Expected a relative .htmd or .md file");
        }
        let resolved = self.root.join(path).canonicalize()?;
        if !resolved.starts_with(&self.root) || !resolved.is_file() {
            bail!("File is outside this vault");
        }
        Ok(resolved)
    }

    pub fn open(&self, relative: &str) -> Result<Document> {
        let original = fs::read_to_string(self.resolve(relative)?)?;
        Ok(Document {
            path: relative.into(),
            blocks: blocks(&original),
            original,
        })
    }

    pub fn save(&self, relative: &str, expected: &str, source: &str) -> Result<()> {
        let path = self.resolve(relative)?;
        if fs::read_to_string(&path)? != expected {
            bail!("File changed on disk. Copy your edits before reloading.");
        }
        // Atomic replacement avoids leaving a partially written note.
        let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
        use std::io::Write;
        temp.write_all(source.as_bytes())?;
        temp.as_file()
            .set_permissions(fs::metadata(&path)?.permissions())?;
        temp.as_file().sync_all()?;
        temp.persist(path)?;
        Ok(())
    }
}

fn supported(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("htmd" | "md")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md_and_htmd_save_exactly_and_conflicts_preserve_disk() -> Result<()> {
        let dir = tempfile::tempdir()?;
        fs::create_dir(dir.path().join("folder"))?;
        fs::write(dir.path().join("folder/a.md"), "# legacy\r\n")?;
        fs::write(dir.path().join("b.htmd"), "# new\n")?;
        fs::write(dir.path().join("future.nbmd"), "not implemented")?;
        let vault = Vault::new(dir.path())?;
        assert_eq!(vault.tree()?.len(), 2);
        let doc = vault.open("folder/a.md")?;
        assert_eq!(doc.source(), "# legacy\r\n");
        vault.save(&doc.path, &doc.original, "# Edited 🦀\r\n")?;
        assert!(vault.save(&doc.path, &doc.original, "overwrite").is_err());
        assert_eq!(vault.open(&doc.path)?.original, "# Edited 🦀\r\n");
        assert!(vault.open("../b.htmd").is_err());
        Ok(())
    }

    #[test]
    #[cfg(unix)]
    fn escaped_symlinks_are_never_opened() -> Result<()> {
        let inside = tempfile::tempdir()?;
        let outside = tempfile::tempdir()?;
        fs::write(outside.path().join("secret.htmd"), "secret")?;
        std::os::unix::fs::symlink(
            outside.path().join("secret.htmd"),
            inside.path().join("link.htmd"),
        )?;
        let vault = Vault::new(inside.path())?;
        assert!(vault.tree()?.is_empty());
        assert!(vault.open("link.htmd").is_err());
        Ok(())
    }
}
