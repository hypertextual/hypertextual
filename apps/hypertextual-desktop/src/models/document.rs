use serde::Serialize;

#[derive(Serialize)]
pub struct Document {
    pub content: String,
    pub revision: String,
}
