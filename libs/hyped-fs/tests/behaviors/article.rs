mod tests {

    const MAX_BYTES: u64 = 16 * 1024 * 1024;
    use crate::common::WorkspaceFixture;
    use std::fs;

    mod when_creating_an_article {
        use super::*;

        #[test]
        fn it_adds_a_markdown_extension_and_initial_heading_inside_a_folder() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.workspace.create_folder_in("Drafts", "").unwrap();

            // When
            let article = fixture.articles().create_file("Hello", "Drafts").unwrap();

            // Then
            assert_eq!(article.path, "Drafts/Hello.md");
            assert_eq!(
                fixture.articles().read(&article.path).unwrap().content,
                "# Hello\n\n"
            );
        }

        #[test]
        fn it_rejects_a_name_that_escapes_the_folder() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.workspace.create_folder_in("Drafts", "").unwrap();

            // When
            let result = fixture.articles().create_file("../escape.md", "Drafts");

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
            let article = fixture.articles().create().unwrap();

            // Then
            assert_eq!(article.path, "Untitled.md");
            assert_eq!(
                fixture.articles().read(&article.path).unwrap().content,
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
            let article = fixture.articles().create().unwrap();

            // Then
            assert_eq!(article.path, "Untitled 3.md");
            assert_eq!(
                fixture.articles().read(&article.path).unwrap().content,
                "# Untitled 3\n\n"
            );
            assert_eq!(
                fixture.articles().read("Untitled.md").unwrap().content,
                "Keep this article"
            );
            assert!(fixture.root().join("Untitled 2.md").is_dir());
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
            let read = fixture.articles().read("Drafts/Untitled.md").unwrap();

            // When
            let saved = fixture
                .articles()
                .save(
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
                fixture.articles().read(&saved.path).unwrap().content,
                "# New title\n"
            );
            assert!(!fixture.root().join("Drafts/Untitled.md").exists());
            assert_eq!(
                fixture
                    .articles()
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
                let read = fixture.articles().read(name).unwrap();

                // When
                let revision = fixture
                    .articles()
                    .write(name, "# Edited\n", &read.revision)
                    .unwrap();

                // Then
                assert_ne!(revision, read.revision);
                assert_eq!(fixture.articles().read(name).unwrap().content, "# Edited\n");
            }
        }

        #[test]
        fn it_accepts_a_retry_when_the_same_content_was_already_written() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("article.md", "Original");
            let original = fixture.articles().read("article.md").unwrap();
            let revision = fixture
                .articles()
                .write("article.md", "Edited", &original.revision)
                .unwrap();

            // When
            let retried = fixture
                .articles()
                .write("article.md", "Edited", &original.revision)
                .unwrap();

            // Then
            assert_eq!(retried, revision);
            assert_eq!(
                fixture.articles().read("article.md").unwrap().content,
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
                    let read = fixture.articles().read(name).unwrap();
                    fixture.write_file(name, "External edit");

                    // When
                    let result = fixture.articles().write(name, "Local edit", &read.revision);

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

    mod when_reading_an_article {
        use super::*;

        #[test]
        fn it_rejects_paths_outside_the_workspace() {
            let fixture = WorkspaceFixture::new();
            for path in ["../outside.md", "/tmp/outside.md", "C:\\outside.md"] {
                // When
                let result = fixture.articles().read(path);

                // Then
                assert_eq!(result.err().unwrap().code, "outsideWorkspace", "{path}");
            }
        }

        #[test]
        fn it_reports_a_missing_article() {
            // Given
            let fixture = WorkspaceFixture::new();

            // When
            let result = fixture.articles().read("missing.md");

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
                let result = fixture.articles().read("binary.md");

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
            let result = fixture.articles().read("image.png");

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
            let result = fixture.articles().read("large.md");

            // Then
            assert_eq!(result.err().unwrap().code, "tooLarge");
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
                let read = fixture.articles().read("article.md").unwrap();

                // When
                fixture
                    .articles()
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
                let read = fixture.articles().read("article.md").unwrap();

                // When
                let result = fixture
                    .articles()
                    .write("article.md", "Edited", &read.revision);

                // Then
                assert_eq!(result.unwrap_err().code, "readOnly");
                assert_eq!(
                    fixture.articles().read("article.md").unwrap().content,
                    "Original"
                );
            }
        }
    }
}
