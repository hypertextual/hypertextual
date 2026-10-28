use crate::error::{Result, error};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use sha2::{Digest, Sha256};

/// An image reference for saving and a URL for display.
#[derive(Serialize)]
pub struct ImageAsset {
    /// The image path relative to its article, or the workspace for standalone previews.
    pub source: String,
    /// A data URL that displays the image in the editor.
    pub url: String,
}

impl ImageAsset {
    /// Builds a relative reference and a display URL from supported image bytes.
    pub fn from_bytes(source: &str, bytes: &[u8]) -> Result<Self> {
        let (mime, _) = Self::media_type(bytes)?;
        Ok(Self {
            source: source.to_owned(),
            url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        })
    }

    /// Derives an image filename from its content and format.
    pub fn filename(bytes: &[u8]) -> Result<String> {
        let (_, extension) = Self::media_type(bytes)?;
        Ok(format!("{:x}.{extension}", Sha256::digest(bytes)))
    }

    /// Identifies a supported image format from its header bytes.
    fn media_type(bytes: &[u8]) -> Result<(&'static str, &'static str)> {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Ok(("image/png", "png"))
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Ok(("image/jpeg", "jpg"))
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Ok(("image/gif", "gif"))
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            Ok(("image/webp", "webp"))
        } else {
            Err(error(
                "unsupported",
                "Choose a PNG, JPEG, GIF, or WebP image.",
            ))
        }
    }
}
