use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

pub(crate) type Result<T> = std::result::Result<T, WorkspaceError>;

pub(crate) fn error(code: &'static str, message: impl Into<String>) -> WorkspaceError {
    WorkspaceError {
        code,
        message: message.into(),
    }
}

impl From<std::io::Error> for WorkspaceError {
    fn from(value: std::io::Error) -> Self {
        error("io", value.to_string())
    }
}
