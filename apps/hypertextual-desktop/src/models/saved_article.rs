use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedArticle {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) revision: String,
}
