use super::*;
impl RichEditor {
    pub(super) fn slash(&self) -> Option<(Range<usize>, Vec<Component>)> {
        if self.slash_dismissed || !self.selection().is_empty() {
            return None;
        }
        let line = self.projection.line_at(self.cursor);
        if line.kind != Kind::Paragraph {
            return None;
        }
        let prefix = &self.projection.text[line.range.start..self.cursor];
        let at = prefix.rfind('/')?;
        if at > 0 && !prefix[..at].ends_with(char::is_whitespace) {
            return None;
        }
        let query = prefix[at + 1..].to_lowercase();
        if query.contains(char::is_whitespace) {
            return None;
        }
        Some((
            line.range.start + at..self.cursor,
            COMPONENTS
                .iter()
                .copied()
                .filter(|c| c.title.to_lowercase().contains(&query))
                .collect(),
        ))
    }
    pub(super) fn insert_component(&mut self, command: Component, cx: &mut Context<Self>) {
        let Some((range, _)) = self.slash() else {
            return;
        };
        self.checkpoint(false);
        let line_start = self.projection.line_at(range.start).range.start;
        let start = self.projection.source_at(line_start);
        let end = self.projection.source_at(range.end);
        self.replace_source(start..end, command.source, Some(command.caret), cx);
        if command.title != "Text" && command.title != "Divider" && command.title != "Chart" {
            self.anchor = self.cursor;
            self.cursor = self.projection.line_at(self.cursor).range.end;
        }
    }
}
#[derive(Clone, Copy)]
pub(super) struct Component {
    pub(super) title: &'static str,
    source: &'static str,
    caret: usize,
}
const COMPONENTS: &[Component] = &[
    Component {
        title: "Text",
        source: "",
        caret: 0,
    },
    Component {
        title: "Heading 1",
        source: "# Heading",
        caret: 2,
    },
    Component {
        title: "Heading 2",
        source: "## Heading",
        caret: 3,
    },
    Component {
        title: "Heading 3",
        source: "### Heading",
        caret: 4,
    },
    Component {
        title: "Bullet list",
        source: "- Item",
        caret: 2,
    },
    Component {
        title: "Numbered list",
        source: "1. Item",
        caret: 3,
    },
    Component {
        title: "Task list",
        source: "- [ ] Task",
        caret: 6,
    },
    Component {
        title: "Quote",
        source: "> Quote",
        caret: 2,
    },
    Component {
        title: "Code block",
        source: "```\ncode\n```",
        caret: 4,
    },
    Component {
        title: "Table",
        source: "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |",
        caret: 2,
    },
    Component {
        title: "Chart",
        source: "```htmd:chart\n{\"version\":1,\"type\":\"bar\",\"title\":\"Weekly notes\",\"labels\":[\"Mon\",\"Tue\",\"Wed\"],\"series\":[{\"name\":\"Notes\",\"values\":[4,7,3]}]}\n```\n\n",
        caret: 0,
    },
    Component {
        title: "Divider",
        source: "---\n\n",
        caret: 5,
    },
];
