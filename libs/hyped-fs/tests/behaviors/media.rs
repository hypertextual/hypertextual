mod tests {

    use crate::common::WorkspaceFixture;
    use std::fs;

    mod when_importing_an_image {
        use super::*;
        const PNG: &[u8] = b"\x89PNG\r\n\x1a\nimage bytes";

        #[test]
        fn it_stores_the_image_beside_the_article_with_a_relative_reference() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let image = fixture.media().import("Drafts/Article.md", PNG).unwrap();

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
            let first = fixture.media().import("Article.md", PNG).unwrap();

            // When
            let second = fixture.media().import("Article.md", PNG).unwrap();

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
            let result = fixture.media().import("Article.md", b"not an image");

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
                let image = fixture.media().import("Drafts/Article.md", PNG).unwrap();

                // When
                fixture
                    .workspace
                    .rename("Drafts", "Renamed folder")
                    .unwrap();
                let reopened = fixture
                    .media()
                    .read("Renamed folder/Article.md", &image.source)
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
            for source in [
                "../escape.png",
                "/escape.png",
                ".images/../escape.png",
                r".images\escape.png",
                r"C:\escape.png",
            ] {
                // When
                let result = fixture.media().read("Article.md", source);

                // Then
                assert_eq!(result.err().unwrap().code, "outsideWorkspace");
            }
        }
    }
}
