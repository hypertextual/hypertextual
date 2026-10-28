//! Hypertextual workspace persistence without a Tauri dependency.
//!
//! Workspace, article, and image models and services live together here.
//! The desktop application supplies the home directory and adapts commands.
//! The frontend owns autosave scheduling. Remote file sync is future library work.

mod error;
mod models;
mod services;

pub use error::{Result, WorkspaceError, error};
pub use models::{
    ArticleContent, ArticleMetadata, ImageAsset, Workspace, WorkspaceListing, WorkspaceNode,
};
pub use services::{ArticleService, MediaService, WorkspaceService};
