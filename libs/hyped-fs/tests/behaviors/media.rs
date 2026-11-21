mod tests {

    use crate::common::WorkspaceFixture;
    use std::fs;

    mod when_importing_a_file_asset {
        use super::*;
        const PNG: &[u8] = b"\x89PNG\r\n\x1a\nimage bytes";
        const SVG: &[u8] =
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\"/></svg>";
        const DRAWIO_SVG: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\" content=\"&lt;mxfile&gt;&lt;diagram&gt;&lt;/diagram&gt;&lt;/mxfile&gt;\"><g/></svg>";
        const DRAWIO_PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x10tEXtmxfile\x00<mxfile/>";
        const DRAWIO_XML: &[u8] = b"<mxfile host=\"Electron\"><diagram id=\"d1\" name=\"Page-1\"><mxGraphModel/></diagram></mxfile>";

        #[test]
        fn it_stores_a_png_in_media_beside_the_article() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let asset = fixture.media().import("Drafts/Article.md", PNG).unwrap();

            // Then
            assert!(asset.source.starts_with(".media/"));
            assert!(asset.source.ends_with(".png"));
            assert!(!asset.source.ends_with(".drawio.png"));
            assert!(asset.url.starts_with("data:image/png;base64,"));
            assert_eq!(
                fs::read(fixture.root().join("Drafts").join(asset.source)).unwrap(),
                PNG
            );
        }

        #[test]
        fn it_stores_an_svg_in_media_and_round_trips_via_read() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let asset = fixture.media().import("Drafts/Article.md", SVG).unwrap();
            let reopened = fixture
                .media()
                .read("Drafts/Article.md", &asset.source)
                .unwrap();

            // Then
            assert!(asset.source.starts_with(".media/"));
            assert!(asset.source.ends_with(".svg"));
            assert!(!asset.source.ends_with(".drawio.svg"));
            assert!(asset.url.starts_with("data:image/svg+xml;base64,"));
            assert_eq!(reopened.url, asset.url);
        }

        #[test]
        fn it_preserves_drawio_svg_extension_in_media() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let asset = fixture
                .media()
                .import("Drafts/Article.md", DRAWIO_SVG)
                .unwrap();
            let reopened = fixture
                .media()
                .read("Drafts/Article.md", &asset.source)
                .unwrap();

            // Then
            assert!(asset.source.starts_with(".media/"));
            assert!(asset.source.ends_with(".drawio.svg"));
            assert!(asset.url.starts_with("data:image/svg+xml;base64,"));
            assert_eq!(reopened.url, asset.url);
        }

        #[test]
        fn it_preserves_drawio_png_extension_in_media() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let asset = fixture
                .media()
                .import("Drafts/Article.md", DRAWIO_PNG)
                .unwrap();
            let reopened = fixture
                .media()
                .read("Drafts/Article.md", &asset.source)
                .unwrap();

            // Then
            assert!(asset.source.starts_with(".media/"));
            assert!(asset.source.ends_with(".drawio.png"));
            assert!(asset.url.starts_with("data:image/png;base64,"));
            assert_eq!(reopened.url, asset.url);
        }

        #[test]
        fn it_stores_plain_drawio_xml_in_media() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Drafts/Article.md", "# Article");

            // When
            let asset = fixture
                .media()
                .import("Drafts/Article.md", DRAWIO_XML)
                .unwrap();
            let reopened = fixture
                .media()
                .read("Drafts/Article.md", &asset.source)
                .unwrap();

            // Then
            assert!(asset.source.starts_with(".media/"));
            assert!(asset.source.ends_with(".drawio"));
            assert!(
                asset
                    .url
                    .starts_with("data:application/vnd.jgraph.mxfile;base64,")
            );
            assert_eq!(reopened.url, asset.url);
        }

        #[test]
        fn it_reuses_an_identical_asset() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Article.md", "# Article");
            let first = fixture.media().import("Article.md", PNG).unwrap();

            // When
            let second = fixture.media().import("Article.md", PNG).unwrap();

            // Then
            assert_eq!(first.source, second.source);
            assert_eq!(
                fs::read_dir(fixture.root().join(".media")).unwrap().count(),
                1
            );
        }

        #[test]
        fn it_rejects_bytes_that_are_not_a_supported_file_asset() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Article.md", "# Article");

            // When
            let result = fixture.media().import("Article.md", b"not an image");

            // Then
            assert_eq!(result.err().unwrap().code, "unsupported");
            assert!(!fixture.root().join(".media").exists());
        }

        mod when_the_article_folder_is_renamed {
            use super::*;

            #[test]
            fn it_keeps_the_asset_reference_resolvable() {
                // Given
                let fixture = WorkspaceFixture::new();
                fixture.write_file("Drafts/Article.md", "# Article");
                let asset = fixture.media().import("Drafts/Article.md", PNG).unwrap();

                // When
                fixture
                    .workspace
                    .rename("Drafts", "Renamed folder")
                    .unwrap();
                let reopened = fixture
                    .media()
                    .read("Renamed folder/Article.md", &asset.source)
                    .unwrap();

                // Then
                assert_eq!(reopened.source, asset.source);
                assert_eq!(reopened.url, asset.url);
            }
        }
    }

    mod when_reading_a_file_asset {
        use super::*;

        #[test]
        fn it_still_reads_legacy_images_directory_assets() {
            // Given
            let fixture = WorkspaceFixture::new();
            fixture.write_file("Article.md", "# Article");
            fs::create_dir_all(fixture.root().join(".images")).unwrap();
            fs::write(
                fixture.root().join(".images/legacy.png"),
                b"\x89PNG\r\n\x1a\nlegacy",
            )
            .unwrap();

            // When
            let asset = fixture
                .media()
                .read("Article.md", ".images/legacy.png")
                .unwrap();

            // Then
            assert_eq!(asset.source, ".images/legacy.png");
            assert!(asset.url.starts_with("data:image/png;base64,"));
        }

        #[test]
        fn it_rejects_references_outside_the_workspace() {
            let fixture = WorkspaceFixture::new();
            for source in [
                "../escape.png",
                "/escape.png",
                ".media/../escape.png",
                r".media\escape.png",
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
