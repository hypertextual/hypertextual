use serde::Serialize;

/// A workspace failure returned to the application.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceError {
    /// A stable code that identifies the failure.
    pub code: &'static str,
    /// A message that explains the failure to the user.
    pub message: String,
}

/// The result of a Hypertextual workspace operation.
pub type Result<T> = std::result::Result<T, WorkspaceError>;

/// Builds a stable workspace failure for services and transport adapters.
pub fn error(code: &'static str, message: impl Into<String>) -> WorkspaceError {
    WorkspaceError {
        code,
        message: message.into(),
    }
}

impl From<std::io::Error> for WorkspaceError {
    fn from(value: std::io::Error) -> Self {
        #[cfg(target_os = "macos")]
        if value.raw_os_error() == Some(11) {
            return error(
                "io",
                "macOS blocked access to this cloud-synced or protected folder (os error 11). In Finder, right-click the folder and choose Keep Downloaded, or grant Hypertextual access in System Settings > Privacy & Security.",
            );
        }
        error("io", value.to_string())
    }
}
