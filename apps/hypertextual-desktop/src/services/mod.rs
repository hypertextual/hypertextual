mod article;
mod media;
mod workspace;

pub use article::ArticleService;
pub use media::MediaService;
pub use workspace::WorkspaceService;

const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[cfg(test)]
mod fixtures {
    use super::{ArticleService, MediaService, WorkspaceService};
    use std::{fs, path::PathBuf};

    pub(super) struct WorkspaceFixture {
        pub(super) workspace: WorkspaceService,
        pub(super) home: tempfile::TempDir,
    }

    impl WorkspaceFixture {
        pub(super) fn new() -> Self {
            let home = tempfile::tempdir().unwrap();
            let workspace = WorkspaceService::from_home(home.path().to_owned());
            Self { workspace, home }
        }

        pub(super) fn root(&self) -> PathBuf {
            self.home.path().join(".hypertextual/workspace")
        }

        pub(super) fn write_file(&self, path: &str, content: impl AsRef<[u8]>) {
            let path = self.root().join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        pub(super) fn articles(&self) -> ArticleService<'_> {
            ArticleService::new(&self.workspace)
        }
        pub(super) fn media(&self) -> MediaService<'_> {
            MediaService::new(&self.workspace)
        }
    }
}
