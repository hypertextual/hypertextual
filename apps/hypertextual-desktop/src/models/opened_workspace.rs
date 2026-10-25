use serde::Serialize;

use super::Entry;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkspace {
    pub(crate) root: String,
    pub(crate) entries: Vec<Entry>,
}
