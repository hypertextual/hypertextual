use serde::Serialize;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) kind: &'static str,
}
