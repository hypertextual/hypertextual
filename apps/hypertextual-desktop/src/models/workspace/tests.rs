use super::{MAX_BYTES, Workspace};
use std::{fs, path::PathBuf};

struct WorkspaceFixture {
    workspace: Workspace,
    home: tempfile::TempDir,
}

impl WorkspaceFixture {
    fn new() -> Self {
        let home = tempfile::tempdir().unwrap();
        let workspace = Workspace::from_home(home.path().to_owned());
        Self { workspace, home }
    }

    fn root(&self) -> PathBuf {
        self.home.path().join(".hypertextual/workspace")
    }

    fn write_file(&self, path: &str, content: impl AsRef<[u8]>) {
        let path = self.root().join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }
}

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
                fixture.workspace.read("Renamed/Hello.md").unwrap().content,
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
            let result = fixture.workspace.create_file("Hello.md", "Drafts");

            // Then
            assert!(result.is_err());
            assert_eq!(
                fixture.workspace.read("Drafts/Hello.md").unwrap().content,
                "Keep me"
            );
        }
    }
}

mod when_creating_an_article {
    use super::*;

    #[test]
    fn it_adds_a_markdown_extension_and_initial_heading_inside_a_folder() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.workspace.create_folder_in("Drafts", "").unwrap();

        // When
        let article = fixture.workspace.create_file("Hello", "Drafts").unwrap();

        // Then
        assert_eq!(article.path, "Drafts/Hello.md");
        assert_eq!(
            fixture.workspace.read(&article.path).unwrap().content,
            "# Hello\n\n"
        );
    }

    #[test]
    fn it_rejects_a_name_that_escapes_the_folder() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.workspace.create_folder_in("Drafts", "").unwrap();

        // When
        let result = fixture.workspace.create_file("../escape.md", "Drafts");

        // Then
        assert_eq!(result.unwrap_err().code, "invalidName");
    }
}

mod when_creating_an_untitled_article {
    use super::*;

    #[test]
    fn it_initializes_the_filename_and_heading() {
        // Given
        let fixture = WorkspaceFixture::new();

        // When
        let article = fixture.workspace.create().unwrap();

        // Then
        assert_eq!(article.path, "Untitled.md");
        assert_eq!(
            fixture.workspace.read(&article.path).unwrap().content,
            "# Untitled\n\n"
        );
    }

    #[test]
    fn it_skips_names_occupied_by_files_and_folders() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("Untitled.md", "Keep this article");
        fixture
            .workspace
            .create_folder_in("Untitled 2.md", "")
            .unwrap();

        // When
        let article = fixture.workspace.create().unwrap();

        // Then
        assert_eq!(article.path, "Untitled 3.md");
        assert_eq!(
            fixture.workspace.read(&article.path).unwrap().content,
            "# Untitled 3\n\n"
        );
        assert_eq!(
            fixture.workspace.read("Untitled.md").unwrap().content,
            "Keep this article"
        );
        assert!(fixture.root().join("Untitled 2.md").is_dir());
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
            fixture.workspace.read(&renamed.path).unwrap().content,
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
            fixture.workspace.read("Drafts/Hello.md").unwrap().content,
            "Original"
        );
        assert_eq!(
            fixture.workspace.read("Drafts/Taken.md").unwrap().content,
            "Keep target"
        );
    }
}

mod when_saving_an_article_title {
    use super::*;

    #[test]
    fn it_selects_an_available_filename_and_preserves_the_existing_article() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("Drafts/Untitled.md", "# Untitled\n");
        fixture.write_file("Drafts/New title.md", "Keep target");
        let read = fixture.workspace.read("Drafts/Untitled.md").unwrap();

        // When
        let saved = fixture
            .workspace
            .save_article(
                "Drafts/Untitled.md",
                "# New title\n",
                &read.revision,
                "New title ",
            )
            .unwrap();

        // Then
        assert_eq!(saved.path, "Drafts/New title 2.md");
        assert_eq!(saved.name, "New title 2.md");
        assert_eq!(
            fixture.workspace.read(&saved.path).unwrap().content,
            "# New title\n"
        );
        assert!(!fixture.root().join("Drafts/Untitled.md").exists());
        assert_eq!(
            fixture
                .workspace
                .read("Drafts/New title.md")
                .unwrap()
                .content,
            "Keep target"
        );
    }
}

mod when_saving_article_content {
    use super::*;

    #[test]
    fn it_persists_each_article_format_with_a_new_revision() {
        let fixture = WorkspaceFixture::new();
        for name in ["article.md", "article.htmd"] {
            // Given
            fixture.write_file(name, "# Original\n");
            let read = fixture.workspace.read(name).unwrap();

            // When
            let revision = fixture
                .workspace
                .write(name, "# Edited\n", &read.revision)
                .unwrap();

            // Then
            assert_ne!(revision, read.revision);
            assert_eq!(fixture.workspace.read(name).unwrap().content, "# Edited\n");
        }
    }

    #[test]
    fn it_accepts_a_retry_when_the_same_content_was_already_written() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("article.md", "Original");
        let original = fixture.workspace.read("article.md").unwrap();
        let revision = fixture
            .workspace
            .write("article.md", "Edited", &original.revision)
            .unwrap();

        // When
        let retried = fixture
            .workspace
            .write("article.md", "Edited", &original.revision)
            .unwrap();

        // Then
        assert_eq!(retried, revision);
        assert_eq!(
            fixture.workspace.read("article.md").unwrap().content,
            "Edited"
        );
    }
}

mod given_an_external_edit {
    use super::*;

    mod when_saving_a_stale_draft {
        use super::*;

        #[test]
        fn it_reports_a_conflict_and_preserves_the_external_content() {
            let fixture = WorkspaceFixture::new();
            for name in ["article.md", "article.htmd"] {
                // Given
                fixture.write_file(name, "Original");
                let read = fixture.workspace.read(name).unwrap();
                fixture.write_file(name, "External edit");

                // When
                let result = fixture.workspace.write(name, "Local edit", &read.revision);

                // Then
                assert_eq!(result.unwrap_err().code, "conflict");
                assert_eq!(
                    fs::read_to_string(fixture.root().join(name)).unwrap(),
                    "External edit"
                );
            }
        }
    }
}

mod when_importing_an_image {
    use super::*;
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nimage bytes";

    #[test]
    fn it_stores_the_image_beside_the_article_with_a_relative_reference() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("Drafts/Article.md", "# Article");

        // When
        let image = fixture
            .workspace
            .import_image("Drafts/Article.md", PNG)
            .unwrap();

        // Then
        assert!(image.source.starts_with(".images/"));
        assert!(image.url.starts_with("data:image/png;base64,"));
        assert_eq!(
            fs::read(fixture.root().join("Drafts").join(image.source)).unwrap(),
            PNG
        );
    }

    #[test]
    fn it_reuses_an_identical_image() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("Article.md", "# Article");
        let first = fixture.workspace.import_image("Article.md", PNG).unwrap();

        // When
        let second = fixture.workspace.import_image("Article.md", PNG).unwrap();

        // Then
        assert_eq!(first.source, second.source);
        assert_eq!(
            fs::read_dir(fixture.root().join(".images"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn it_rejects_bytes_that_are_not_a_supported_image() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("Article.md", "# Article");

        // When
        let result = fixture
            .workspace
            .import_image("Article.md", b"not an image");

        // Then
        assert_eq!(result.err().unwrap().code, "unsupported");
        assert!(!fixture.root().join(".images").exists());
    }

    mod when_the_article_folder_is_renamed {
        use super::*;

        #[test]
        fn it_keeps_the_image_reference_resolvable() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");
            let image = fixture
                .workspace
                .import_image("Drafts/Article.md", PNG)
                .unwrap();

            // When
            fixture
                .workspace
                .rename("Drafts", "Renamed folder")
                .unwrap();
            let reopened = fixture
                .workspace
                .read_image("Renamed folder/Article.md", &image.source)
                .unwrap();

            // Then
            assert_eq!(reopened.source, image.source);
            assert_eq!(reopened.url, image.url);
        }
    }
}

mod when_reading_an_image {
    use super::*;

    #[test]
    fn it_rejects_references_outside_the_workspace() {
        let fixture = WorkspaceFixture::new();
        for source in ["../escape.png", "/escape.png"] {
            // When
            let result = fixture.workspace.read_image("Article.md", source);

            // Then
            assert_eq!(result.err().unwrap().code, "outsideWorkspace");
        }
    }
}

mod when_reading_an_article {
    use super::*;

    #[test]
    fn it_rejects_paths_outside_the_workspace() {
        let fixture = WorkspaceFixture::new();
        for path in ["../outside.md", "/tmp/outside.md", "C:\\outside.md"] {
            // When
            let result = fixture.workspace.read(path);

            // Then
            assert_eq!(result.err().unwrap().code, "outsideWorkspace", "{path}");
        }
    }

    #[test]
    fn it_reports_a_missing_article() {
        // Given
        let fixture = WorkspaceFixture::new();

        // When
        let result = fixture.workspace.read("missing.md");

        // Then
        assert_eq!(result.err().unwrap().code, "io");
    }

    #[test]
    fn it_rejects_non_utf8_and_nul_content() {
        let fixture = WorkspaceFixture::new();
        for content in [b"\xff".as_slice(), b"binary\0data".as_slice()] {
            // Given
            fixture.write_file("binary.md", content);

            // When
            let result = fixture.workspace.read("binary.md");

            // Then
            assert_eq!(result.err().unwrap().code, "unsupported");
        }
    }

    #[test]
    fn it_rejects_a_non_article_extension() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("image.png", "image");

        // When
        let result = fixture.workspace.read("image.png");

        // Then
        assert_eq!(result.err().unwrap().code, "unsupported");
    }

    #[test]
    fn it_rejects_an_article_larger_than_the_editing_limit() {
        // Given
        let fixture = WorkspaceFixture::new();
        fixture.write_file("large.md", "");
        fs::File::create(fixture.root().join("large.md"))
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();

        // When
        let result = fixture.workspace.read("large.md");

        // Then
        assert_eq!(result.err().unwrap().code, "tooLarge");
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
mod given_unix_file_permissions {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    mod when_saving_an_article {
        use super::*;

        #[test]
        fn it_preserves_file_permissions() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("article.md", "Original");
            let path = fixture.root().join("article.md");
            fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
            let read = fixture.workspace.read("article.md").unwrap();

            // When
            fixture
                .workspace
                .write("article.md", "Edited", &read.revision)
                .unwrap();

            // Then
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o640
            );
        }

        #[test]
        fn it_rejects_a_read_only_file_and_keeps_its_content() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("article.md", "Original");
            fs::set_permissions(
                fixture.root().join("article.md"),
                fs::Permissions::from_mode(0o440),
            )
            .unwrap();
            let read = fixture.workspace.read("article.md").unwrap();

            // When
            let result = fixture
                .workspace
                .write("article.md", "Edited", &read.revision);

            // Then
            assert_eq!(result.unwrap_err().code, "readOnly");
            assert_eq!(
                fixture.workspace.read("article.md").unwrap().content,
                "Original"
            );
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
            let result = fixture.workspace.read("link.md");

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
