use hyped_fs::{ArticleService, MediaService, WorkspaceService};
use std::{fs, path::PathBuf};

/// One test-owned Hypertextual workspace and its temporary home.
pub struct WorkspaceFixture {
    /// The public workspace service used by each case.
    pub workspace: WorkspaceService,
    /// The temporary home removed when the fixture is dropped.
    pub home: tempfile::TempDir,
}

impl WorkspaceFixture {
    pub fn new() -> Self {
        let home = tempfile::tempdir().unwrap();
        let workspace = WorkspaceService::from_home(home.path().to_owned());
        Self { workspace, home }
    }

    pub fn root(&self) -> PathBuf {
        self.home.path().join(".hypertextual/workspace")
    }

    pub fn write_file(&self, path: &str, content: impl AsRef<[u8]>) {
        let path = self.root().join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }
    pub fn articles(&self) -> ArticleService<'_> {
        ArticleService::new(&self.workspace)
    }
    pub fn media(&self) -> MediaService<'_> {
        MediaService::new(&self.workspace)
    }
}
