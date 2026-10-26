use std::{
    fs,
    io::Write,
    path::{Component, Path},
};

use super::{MAX_BYTES, WorkspaceService};
use crate::{
    error::{Result, error},
    models::{ArticleContent, ImageAsset},
};

/// Stores and reads images within one workspace.
pub struct MediaService<'a> {
    /// The workspace boundary used by image operations.
    workspace: &'a WorkspaceService,
}

impl<'a> MediaService<'a> {
    /// Uses the supplied workspace for every image operation.
    pub(crate) fn new(workspace: &'a WorkspaceService) -> Self {
        Self { workspace }
    }

    pub(crate) fn import(&self, article_path: &str, bytes: &[u8]) -> Result<ImageAsset> {
        ArticleContent::validate_path(article_path)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error("tooLarge", "Images must be smaller than 16 MB."));
        }
        let name = ImageAsset::filename(bytes)?;
        let article = self.workspace.resolve(article_path)?;
        let directory = article.parent().unwrap().join(".images");
        fs::create_dir_all(&directory)?;
        if !directory
            .canonicalize()?
            .starts_with(self.workspace.root()?)
        {
            return Err(error(
                "outsideWorkspace",
                "The image folder is outside this workspace.",
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
                    return Err(error("io", "The image asset name is already in use."));
                }
            }
            Err(e) => return Err(e.into()),
        }
        self.read(article_path, &format!(".images/{name}"))
    }

    pub(crate) fn read(&self, article_path: &str, source: &str) -> Result<ImageAsset> {
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
            .map_err(|_| error("outsideWorkspace", "Image is outside the workspace."))?
            .to_string_lossy()
            .into_owned();
        let path = self.workspace.resolve(&relative)?;
        if fs::metadata(&path)?.len() > MAX_BYTES {
            return Err(error("tooLarge", "Image is too large."));
        }
        let bytes = fs::read(path)?;
        ImageAsset::from_bytes(source, &bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::super::fixtures::WorkspaceFixture;
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
            for source in ["../escape.png", "/escape.png"] {
                // When
                let result = fixture.media().read("Article.md", source);

                // Then
                assert_eq!(result.err().unwrap().code, "outsideWorkspace");
            }
        }
    }
}
