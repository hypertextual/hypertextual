use crate::error::{Result, error};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use sha2::{Digest, Sha256};

/// A file asset reference for saving and a data URL for display.
#[derive(Serialize)]
pub struct FileAsset {
    /// The asset path relative to its article, or the workspace for standalone previews.
    pub source: String,
    /// A data URL that displays or loads the asset in the editor and file viewer.
    pub url: String,
}

impl FileAsset {
    /// Builds a relative reference and a display data URL from supported file asset bytes.
    pub fn from_bytes(source: &str, bytes: &[u8]) -> Result<Self> {
        let (mime, _) = Self::media_type(bytes)?;
        Ok(Self {
            source: source.to_owned(),
            url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        })
    }

    /// Derives a content-addressed filename from its bytes and detected format.
    pub fn filename(bytes: &[u8]) -> Result<String> {
        let (_, extension) = Self::media_type(bytes)?;
        Ok(format!("{:x}.{extension}", Sha256::digest(bytes)))
    }

    /// Identifies a supported file asset format from its header or XML markup.
    fn media_type(bytes: &[u8]) -> Result<(&'static str, &'static str)> {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            if Self::png_has_drawio_metadata(bytes) {
                Ok(("image/png", "drawio.png"))
            } else {
                Ok(("image/png", "png"))
            }
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Ok(("image/jpeg", "jpg"))
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Ok(("image/gif", "gif"))
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            Ok(("image/webp", "webp"))
        } else if let Ok(text) = std::str::from_utf8(bytes) {
            let trimmed = text.trim_start_matches('\u{feff}').trim_start();
            if Self::is_svg_markup(trimmed) {
                if Self::svg_has_drawio_metadata(trimmed) {
                    Ok(("image/svg+xml", "drawio.svg"))
                } else {
                    Ok(("image/svg+xml", "svg"))
                }
            } else if Self::is_drawio_xml(trimmed) {
                Ok(("application/vnd.jgraph.mxfile", "drawio"))
            } else {
                Err(error(
                    "unsupported",
                    "Choose a PNG, JPEG, GIF, WebP, SVG, or Draw.io file.",
                ))
            }
        } else {
            Err(error(
                "unsupported",
                "Choose a PNG, JPEG, GIF, WebP, SVG, or Draw.io file.",
            ))
        }
    }

    /// Returns true when a PNG contains embedded Draw.io diagram metadata chunks.
    fn png_has_drawio_metadata(bytes: &[u8]) -> bool {
        bytes.windows(6).any(|w| w == b"mxfile") || bytes.windows(12).any(|w| w == b"mxGraphModel")
    }

    /// Returns true when UTF-8 text begins with an SVG root element or XML declaration containing `<svg`.
    fn is_svg_markup(trimmed: &str) -> bool {
        trimmed.starts_with("<svg")
            || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
            || (trimmed.starts_with("<!DOCTYPE svg") && trimmed.contains("<svg"))
    }

    /// Returns true when SVG markup carries embedded Draw.io `<mxfile>` XML data.
    fn svg_has_drawio_metadata(trimmed: &str) -> bool {
        trimmed.contains("content=")
            && (trimmed.contains("mxfile")
                || trimmed.contains("mxGraphModel")
                || trimmed.contains("%3Cmxfile"))
    }

    /// Returns true when UTF-8 text is a Draw.io `<mxfile>` XML document.
    fn is_drawio_xml(trimmed: &str) -> bool {
        trimmed.starts_with("<mxfile")
            || (trimmed.starts_with("<?xml") && trimmed.contains("<mxfile"))
    }
}
