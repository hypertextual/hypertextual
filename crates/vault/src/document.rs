use pulldown_cmark::{Event, Options, Parser};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Block {
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub path: String,
    /// Exact on-disk content used to detect external changes before saving.
    pub original: String,
    pub blocks: Vec<Block>,
}

impl Document {
    pub fn source(&self) -> String {
        self.blocks.iter().map(|b| b.source.as_str()).collect()
    }

    pub fn replace(&mut self, index: usize, source: String) {
        self.blocks[index].source = source;
    }

    /// Reparse only at an editing boundary, never on every keystroke.
    pub fn reparse(&mut self) {
        self.blocks = blocks(&self.source());
    }
}

/// Top-level CommonMark nodes, with every intervening byte retained.
/// A list/quote/table/fence remains a single editable block.
pub fn blocks(source: &str) -> Vec<Block> {
    let mut starts = Vec::new();
    let mut depth = 0usize;
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_GFM;
    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        match event {
            Event::Start(_) => {
                if depth == 0 {
                    starts.push(if starts.is_empty() { 0 } else { range.start });
                }
                depth += 1;
            }
            Event::End(_) => depth = depth.saturating_sub(1),
            _ if depth == 0 => starts.push(if starts.is_empty() { 0 } else { range.start }),
            _ => {}
        }
    }
    starts.sort_unstable();
    starts.dedup();
    if starts.is_empty() {
        starts.push(0);
    }
    starts.push(source.len());
    starts
        .windows(2)
        .map(|r| Block {
            source: source[r[0]..r[1]].into(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_nested_markdown_unicode_and_spacing() {
        let text = "\n# Café 🦀\r\n\r\n- **one**\r\n  - nested\r\n\r\n```rs\r\n\r\nlet x = 1;\r\n```\r\n\r\n> quote\r\n>\r\n> next\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n";
        let parsed = blocks(text);
        assert_eq!(
            parsed.iter().map(|b| b.source.as_str()).collect::<String>(),
            text
        );
        assert_eq!(parsed.len(), 5);
    }

    #[test]
    fn edit_can_split_or_delete_nodes_without_touching_neighbors() {
        let mut doc = Document {
            path: "test.htmd".into(),
            original: "# Title\n\nHello\n\nEnd\n".into(),
            blocks: blocks("# Title\n\nHello\n\nEnd\n"),
        };
        doc.replace(1, "Hello 🦀\n\n## New\n\n".into());
        doc.reparse();
        assert_eq!(doc.blocks.len(), 4);
        assert_eq!(doc.source(), "# Title\n\nHello 🦀\n\n## New\n\nEnd\n");
        doc.replace(1, String::new());
        doc.reparse();
        assert_eq!(doc.blocks.len(), 3);
        assert_eq!(blocks("").len(), 1);
    }
}
