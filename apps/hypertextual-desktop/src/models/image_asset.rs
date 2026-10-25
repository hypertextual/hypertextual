use serde::Serialize;

#[derive(Serialize)]
pub struct ImageAsset {
    pub(crate) source: String,
    pub(crate) url: String,
}
