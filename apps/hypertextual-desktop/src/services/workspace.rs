use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use crate::{
    error::{Result, error},
    models::{ArticleContent, Workspace, WorkspaceListing, WorkspaceNode},
};

/// Browses and changes entries within one local workspace.
pub struct WorkspaceService {
    /// The workspace location shared by file operations.
    workspace: Workspace,
}

impl WorkspaceService {
    /// Selects the default workspace under the supplied home directory.
    pub(crate) fn from_home(home: PathBuf) -> Self {
        Self {
            workspace: Workspace::from_home(home),
        }
    }

    pub(super) fn root(&self) -> Result<PathBuf> {
        fs::create_dir_all(&self.workspace.root)?;
        Ok(self.workspace.root.canonicalize()?)
    }

    pub(super) fn resolve(&self, relative: &str) -> Result<PathBuf> {
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

    pub(crate) fn open(&self) -> Result<WorkspaceListing> {
        Ok(WorkspaceListing {
            root: self.root()?.to_string_lossy().into_owned(),
            entries: self.list("")?,
        })
    }

    pub(crate) fn list(&self, relative: &str) -> Result<Vec<WorkspaceNode>> {
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
            entries.push(WorkspaceNode { path, name, kind });
        }
        entries.sort_by(|a, b| {
            (a.kind != "directory")
                .cmp(&(b.kind != "directory"))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }

    pub(crate) fn create_folder_in(&self, name: &str, parent: &str) -> Result<WorkspaceNode> {
        let name = WorkspaceNode::validate_name(name)?;
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
        Ok(WorkspaceNode {
            path: if parent.is_empty() {
                name.to_owned()
            } else {
                format!("{parent}/{name}")
            },
            name: name.to_owned(),
            kind: "directory",
        })
    }

    pub(crate) fn rename(&self, relative: &str, name: &str) -> Result<WorkspaceNode> {
        let name = WorkspaceNode::validate_name(name)?;
        let source = self.resolve(relative)?;
        let root = self.root()?;
        // Rename the workspace entry itself; reject symlinks rather than renaming their targets.
        let original = root.join(relative);
        if fs::symlink_metadata(&original)?.file_type().is_symlink() {
            return Err(error("unsupported", "Linked entries cannot be renamed."));
        }
        let kind = if source.is_dir() { "directory" } else { "file" };
        if kind == "file" {
            ArticleContent::validate_path(name)?;
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
        Ok(WorkspaceNode {
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
}

#[cfg(test)]
mod tests {
    use super::super::fixtures::WorkspaceFixture;
    use std::fs;
    use std::path::PathBuf;

    mod when_opening_a_new_workspace {
        use super::*;

        #[test]
        fn it_creates_the_default_directory_with_no_entries() {
            // Given
            let fixture = WorkspaceFixture::new();

            // When
            let opened = fixture.workspace.open().unwrap();

            // Then
            assert!(fixture.root().is_dir());
            assert_eq!(
                PathBuf::from(opened.root),
                fixture.root().canonicalize().unwrap()
            );
            assert!(opened.entries.is_empty());
        }
    }

    mod given_existing_workspace_entries {
        use super::*;

        mod when_listing_the_workspace {
            use super::*;

            #[test]
            fn it_lists_folders_before_articles_and_keeps_unicode_names() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.workspace.create_folder_in("Research", "").unwrap();
                fixture.write_file("éclair.md", "# Bonjour");

                // When
                let entries = fixture.workspace.list("").unwrap();

                // Then
                assert_eq!(entries.len(), 2);
                assert_eq!(entries[0].name, "Research");
                assert_eq!(entries[0].kind, "directory");
                assert_eq!(entries[1].path, "éclair.md");
            }

            #[test]
            fn it_hides_image_directories_and_atomic_save_files() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.write_file(".images/photo.png", "image");
                fixture.write_file(".hypertextual-save-pending", "draft");
                fixture.write_file("visible.md", "# Visible");

                // When
                let entries = fixture.workspace.list("").unwrap();

                // Then
                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0].path, "visible.md");
            }
        }
    }

    mod when_creating_a_folder {
        use super::*;

        #[test]
        fn it_trims_the_name_and_creates_an_empty_directory() {
            // Given
            let fixture = WorkspaceFixture::new();

            // When
            let folder = fixture
                .workspace
                .create_folder_in("  Research  ", "")
                .unwrap();

            // Then
            assert_eq!(folder.path, "Research");
            assert_eq!(folder.kind, "directory");
            assert!(fixture.root().join("Research").is_dir());
            assert!(fixture.workspace.list("Research").unwrap().is_empty());
        }

        #[test]
        fn it_rejects_names_that_are_not_workspace_entries() {
            // Given
            let fixture = WorkspaceFixture::new();
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
                // When
                let result = fixture.workspace.create_folder_in(name, "");

                // Then
                assert_eq!(result.unwrap_err().code, "invalidName", "{name:?}");
            }
        }

        #[test]
        fn it_rejects_a_parent_outside_the_workspace() {
            // Given
            let fixture = WorkspaceFixture::new();

            // When
            let result = fixture.workspace.create_folder_in("Escape", "../");

            // Then
            assert_eq!(result.unwrap_err().code, "outsideWorkspace");
        }
    }

    mod given_an_existing_folder {
        use super::*;

        mod when_creating_a_folder_with_the_same_name {
            use super::*;

            #[test]
            fn it_reports_the_conflict_and_keeps_the_folder() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.workspace.create_folder_in("Research", "").unwrap();

                // When
                let result = fixture.workspace.create_folder_in("Research", "");

                // Then
                assert_eq!(result.unwrap_err().code, "nameUnavailable");
                assert!(fixture.root().join("Research").is_dir());
            }
        }

        mod when_renaming_the_folder {
            use super::*;

            #[test]
            fn it_moves_the_folder_with_its_articles() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.write_file("Drafts/Hello.md", "# Hello\n");

                // When
                let renamed = fixture.workspace.rename("Drafts", "Renamed").unwrap();

                // Then
                assert_eq!(renamed.path, "Renamed");
                assert!(!fixture.root().join("Drafts").exists());
                assert_eq!(
                    fixture.articles().read("Renamed/Hello.md").unwrap().content,
                    "# Hello\n"
                );
            }

            #[test]
            fn it_rejects_an_invalid_name_without_moving_the_folder() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.workspace.create_folder_in("Drafts", "").unwrap();

                // When
                let result = fixture.workspace.rename("Drafts", "..");

                // Then
                assert_eq!(result.unwrap_err().code, "invalidName");
                assert!(fixture.root().join("Drafts").is_dir());
            }
        }
    }

    mod given_an_existing_article {
        use super::*;

        mod when_creating_an_entry_with_the_same_name {
            use super::*;

            #[test]
            fn it_does_not_replace_the_article_with_a_folder() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.write_file("existing.md", "Keep me");

                // When
                let result = fixture.workspace.create_folder_in("existing.md", "");

                // Then
                assert_eq!(result.unwrap_err().code, "nameUnavailable");
                assert_eq!(
                    fs::read_to_string(fixture.root().join("existing.md")).unwrap(),
                    "Keep me"
                );
            }

            #[test]
            fn it_does_not_overwrite_an_article_in_a_folder() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.write_file("Drafts/Hello.md", "Keep me");

                // When
                let result = fixture.articles().create_file("Hello.md", "Drafts");

                // Then
                assert!(result.is_err());
                assert_eq!(
                    fixture.articles().read("Drafts/Hello.md").unwrap().content,
                    "Keep me"
                );
            }
        }
    }

    mod when_renaming_an_article {
        use super::*;

        #[test]
        fn it_changes_the_path_and_preserves_the_content() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Hello.md", "# Hello\n\n");

            // When
            let renamed = fixture
                .workspace
                .rename("Drafts/Hello.md", "World.md")
                .unwrap();

            // Then
            assert_eq!(renamed.path, "Drafts/World.md");
            assert!(!fixture.root().join("Drafts/Hello.md").exists());
            assert_eq!(
                fixture.articles().read(&renamed.path).unwrap().content,
                "# Hello\n\n"
            );
        }

        #[test]
        fn it_preserves_both_articles_when_the_target_name_is_taken() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Hello.md", "Original");
            fixture.write_file("Drafts/Taken.md", "Keep target");

            // When
            let result = fixture.workspace.rename("Drafts/Hello.md", "Taken.md");

            // Then
            assert!(result.is_err());
            assert_eq!(
                fixture.articles().read("Drafts/Hello.md").unwrap().content,
                "Original"
            );
            assert_eq!(
                fixture.articles().read("Drafts/Taken.md").unwrap().content,
                "Keep target"
            );
        }
    }

    mod when_deleting_an_entry {
        use super::*;

        #[test]
        fn it_rejects_the_workspace_root_and_outside_paths() {
            let fixture = WorkspaceFixture::new();
            for path in ["", "../outside"] {
                // When
                let result = fixture.workspace.delete(path);

                // Then
                assert_eq!(result.unwrap_err().code, "outsideWorkspace");
                assert!(fixture.home.path().exists());
            }
        }
    }

    #[cfg(unix)]
    mod given_a_symlink_outside_the_workspace {
        use super::*;
        use std::os::unix::fs::symlink;

        mod when_reading_the_link {
            use super::*;

            #[test]
            fn it_rejects_access_to_the_external_article() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.workspace.open().unwrap();
                let outside = fixture.home.path().join("outside.md");
                fs::write(&outside, "Outside").unwrap();
                symlink(outside, fixture.root().join("link.md")).unwrap();

                // When
                let result = fixture.articles().read("link.md");

                // Then
                assert_eq!(result.err().unwrap().code, "outsideWorkspace");
            }
        }

        mod when_listing_the_workspace {
            use super::*;

            #[test]
            fn it_marks_the_link_as_unavailable() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.workspace.open().unwrap();
                let outside = fixture.home.path().join("outside.md");
                fs::write(&outside, "Outside").unwrap();
                symlink(outside, fixture.root().join("link.md")).unwrap();

                // When
                let entries = fixture.workspace.list("").unwrap();

                // Then
                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0].kind, "unavailable");
            }
        }
    }
}
