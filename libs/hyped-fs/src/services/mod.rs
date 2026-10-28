mod article;
mod media;
mod workspace;

pub use article::ArticleService;
pub use media::MediaService;
pub use workspace::WorkspaceService;

const MAX_BYTES: u64 = 16 * 1024 * 1024;
