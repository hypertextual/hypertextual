use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use std::ops::Range;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Kind {
    #[default]
    Paragraph,
    Heading(u8),
    Code,
    Quote,
    List,
    Table,
    Rule,
    Chart,
}
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Marks {
    pub bold: bool,
    pub italic: bool,
    pub code: bool,
    pub strike: bool,
    pub link: bool,
}
#[derive(Clone, Debug)]
pub struct Span {
    pub range: Range<usize>,
    pub marks: Marks,
}
#[derive(Clone, Debug)]
pub struct Line {
    pub range: Range<usize>,
    pub kind: Kind,
    pub marker: String,
    pub spans: Vec<Span>,
}
#[derive(Clone, Debug)]
pub struct Projection {
    pub text: String,
    pub source_offsets: Vec<usize>,
    pub source_ends: Vec<usize>,
    pub lines: Vec<Line>,
    pub charts: std::collections::HashMap<usize, super::chart::ChartNode>,
}

impl Projection {
    pub fn new(source: &str) -> Self {
        let mut out = Self {
            text: String::new(),
            source_offsets: vec![0],
            source_ends: vec![0],
            lines: vec![],
            charts: Default::default(),
        };
        let mut marks = Marks::default();
        let mut kind = Kind::Paragraph;
        let mut quote: usize = 0;
        let mut list: usize = 0;
        let mut need_line = true;
        let mut marker = String::new();
        let mut last_source = 0;
        let mut chart_at: Option<usize> = None;
        let options = Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_GFM;
        for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
            if let Some(at) = chart_at {
                match event {
                    Event::Text(_) => {
                        let chart = out.charts.get_mut(&at).unwrap();
                        chart.body_range = range.clone();
                        chart.data = htmd_vault::ChartSpec::parse(&source[range])
                            .map_err(|error| error.to_string());
                    }
                    Event::End(TagEnd::CodeBlock) => {
                        chart_at = None;
                        need_line = true;
                        kind = Kind::Paragraph;
                        marker.clear();
                    }
                    _ => {}
                }
                continue;
            }
            match event {
                Event::Start(tag) => match tag {
                    Tag::Heading { level, .. } => {
                        kind = Kind::Heading(level as u8);
                        marker = "#".repeat(level as usize);
                        need_line = true;
                    }
                    Tag::Paragraph => {
                        kind = if list > 0 {
                            Kind::List
                        } else if quote > 0 {
                            Kind::Quote
                        } else {
                            Kind::Paragraph
                        };
                        need_line = true;
                    }
                    Tag::CodeBlock(CodeBlockKind::Fenced(info))
                        if info.as_ref() == "htmd:chart" =>
                    {
                        kind = Kind::Chart;
                        marker.clear();
                        out.start_line(kind, marker.clone(), range.start, source);
                        let at = out.text.len();
                        out.text.push('\u{fffc}');
                        out.source_offsets.extend([range.end; 3]);
                        out.source_ends.extend([range.end; 3]);
                        let line = out.lines.last_mut().unwrap();
                        line.range.end = at + 3;
                        line.spans.push(Span {
                            range: at..at + 3,
                            marks: Marks::default(),
                        });
                        out.charts.insert(
                            at,
                            super::chart::ChartNode {
                                source_range: range.clone(),
                                body_range: {
                                    let start = range.start
                                        + source[range.clone()]
                                            .find('\n')
                                            .map_or(range.len(), |at| at + 1);
                                    start..start
                                },
                                data: Err("Empty chart data".into()),
                            },
                        );
                        last_source = range.end;
                        chart_at = Some(at);
                        need_line = false;
                    }
                    Tag::CodeBlock(_) => {
                        kind = Kind::Code;
                        marker.clear();
                        need_line = true;
                    }
                    Tag::BlockQuote(_) => {
                        quote += 1;
                        kind = Kind::Quote;
                    }
                    Tag::List(_) => {
                        list += 1;
                    }
                    Tag::Item => {
                        kind = Kind::List;
                        marker = if source[range.clone()]
                            .trim_start()
                            .starts_with(|c: char| c.is_ascii_digit())
                        {
                            "1.".into()
                        } else {
                            "•".into()
                        };
                        need_line = true;
                    }
                    Tag::TableHead | Tag::TableRow => {
                        kind = Kind::Table;
                        marker.clear();
                        need_line = true;
                    }
                    Tag::Strong => marks.bold = true,
                    Tag::Emphasis => marks.italic = true,
                    Tag::Strikethrough => marks.strike = true,
                    Tag::Link { .. } => marks.link = true,
                    _ => {}
                },
                Event::End(tag) => match tag {
                    TagEnd::Heading(_)
                    | TagEnd::Paragraph
                    | TagEnd::CodeBlock
                    | TagEnd::Item
                    | TagEnd::TableHead
                    | TagEnd::TableRow => {
                        // Markdown ignores trailing horizontal space, but an
                        // editor must keep it visible so typing after Space
                        // does not insert the next word before that space.
                        let end = source[..range.end].trim_end_matches(['\n', '\r']).len();
                        let start = source[..end].trim_end_matches([' ', '\t']).len();
                        if start < end && start >= last_source && !out.lines.is_empty() {
                            out.append(&source[start..end], start, end, source, marks);
                            last_source = end;
                        }
                        need_line = true;
                        kind = Kind::Paragraph;
                        if list == 0 {
                            marker.clear();
                        }
                    }
                    TagEnd::BlockQuote(_) => quote = quote.saturating_sub(1),
                    TagEnd::List(_) => {
                        list = list.saturating_sub(1);
                        marker.clear();
                    }
                    TagEnd::Strong => marks.bold = false,
                    TagEnd::Emphasis => marks.italic = false,
                    TagEnd::Strikethrough => marks.strike = false,
                    TagEnd::Link => marks.link = false,
                    TagEnd::TableCell => {
                        if let Some(line) = out.lines.last_mut() {
                            line.range.end = out.text.len();
                        }
                        // Cell separators are display-only. Every boundary remains
                        // anchored to a source byte; text edits preserve the pipes.
                        out.append("   ", range.end, range.end, source, marks);
                    }
                    _ => {}
                },
                Event::Text(text) | Event::Html(text) | Event::InlineHtml(text) => {
                    if need_line {
                        out.start_line(kind, marker.clone(), range.start, source);
                        need_line = false;
                    }
                    out.append(&text, range.start, range.end, source, marks);
                    last_source = range.end;
                }
                Event::Code(text) => {
                    if need_line {
                        out.start_line(kind, marker.clone(), range.start + 1, source);
                        need_line = false;
                    }
                    let code_start = source[range.clone()]
                        .find(text.as_ref())
                        .map(|n| range.start + n)
                        .unwrap_or(range.start);
                    out.append(
                        &text,
                        code_start,
                        code_start + text.len(),
                        source,
                        Marks {
                            code: true,
                            ..marks
                        },
                    );
                    last_source = code_start + text.len();
                }
                Event::SoftBreak | Event::HardBreak => {
                    if kind == Kind::Code {
                        out.append("\n", range.start, range.end, source, marks);
                    } else {
                        out.start_line(kind, marker.clone(), range.end, source);
                    }
                    last_source = range.end;
                }
                Event::TaskListMarker(checked) => {
                    marker = if checked { "☑".into() } else { "☐".into() }
                }
                Event::Rule => {
                    out.start_line(Kind::Rule, String::new(), range.end, source);
                    need_line = true;
                    last_source = range.end;
                }
                _ => {}
            }
        }
        if out.lines.is_empty() {
            out.start_line(Kind::Paragraph, String::new(), source.len(), source);
        }
        // A trailing source separator is an empty editable paragraph, so a
        // second Enter can always leave a list/code/heading and keep writing.
        if source.ends_with("\n\n") && last_source < source.len().saturating_sub(1) {
            out.start_line(Kind::Paragraph, String::new(), source.len(), source);
        }
        out
    }

    fn start_line(&mut self, kind: Kind, marker: String, source_start: usize, source: &str) {
        // CommonMark discards blank paragraphs. Four source newlines mean an
        // editable blank paragraph between two blocks, as produced by Enter
        // at the end of a paragraph with another paragraph following it.
        if let Some(previous) = self.lines.last() {
            let end = self.source_ends[self.text.len()];
            if previous.kind != Kind::Code && kind != Kind::Code && end <= source_start {
                let newlines: Vec<_> = source[end..source_start]
                    .match_indices('\n')
                    .map(|(i, _)| end + i + 1)
                    .collect();
                let extra = newlines.len().saturating_sub(2) / 2;
                for index in 0..extra {
                    self.push_line(Kind::Paragraph, String::new(), newlines[index * 2 + 1]);
                }
            }
        }
        self.push_line(kind, marker, source_start);
    }
    fn push_line(&mut self, kind: Kind, marker: String, source_start: usize) {
        if let Some(previous) = self.lines.last_mut() {
            previous.range.end = self.text.len();
            self.text.push('\n');
            self.source_offsets.push(source_start);
            self.source_ends.push(source_start);
        } else {
            self.source_offsets[0] = source_start;
            self.source_ends[0] = source_start;
        }
        let start = self.text.len();
        self.source_offsets[start] = source_start;
        self.source_ends[start] = source_start;
        self.lines.push(Line {
            range: start..start,
            kind,
            marker,
            spans: vec![],
        });
    }

    fn append(&mut self, text: &str, start: usize, end: usize, source: &str, marks: Marks) {
        let mut source_cursor = start.min(source.len());
        for ch in text.chars() {
            if ch == '\n' {
                if let Some(line) = self.lines.last_mut() {
                    line.range.end = self.text.len();
                }
                self.text.push(ch);
                source_cursor = (source_cursor + 1).min(end);
                self.source_offsets.push(source_cursor);
                self.source_ends.push(source_cursor);
                let previous = self.lines.last().unwrap();
                self.lines.push(Line {
                    range: self.text.len()..self.text.len(),
                    kind: previous.kind,
                    marker: previous.marker.clone(),
                    spans: vec![],
                });
                continue;
            }
            let display_start = self.text.len();
            // Pulldown decodes escapes/entities. Match literal text inside its
            // supplied range; a decoded entity maps to its complete source token.
            let matched = source.get(source_cursor..end).and_then(|s| s.find(ch));
            let ch_source = matched.map(|n| source_cursor + n).unwrap_or(source_cursor);
            self.source_offsets[display_start] = ch_source;
            self.text.push(ch);
            for byte in 1..=ch.len_utf8() {
                self.source_offsets.push((ch_source + byte).min(end));
                self.source_ends.push((ch_source + byte).min(end));
            }
            source_cursor = matched.map(|_| ch_source + ch.len_utf8()).unwrap_or(end);
            let line = self.lines.last_mut().unwrap();
            line.range.end = self.text.len();
            if let Some(last) = line
                .spans
                .last_mut()
                .filter(|s| s.marks == marks && s.range.end == display_start)
            {
                last.range.end = self.text.len();
            } else {
                line.spans.push(Span {
                    range: display_start..self.text.len(),
                    marks,
                });
            }
        }
    }

    pub fn source_at(&self, display: usize) -> usize {
        self.source_offsets[display.min(self.text.len())]
    }
    pub fn source_end(&self, display: usize) -> usize {
        self.source_ends[display.min(self.text.len())]
    }
    pub fn display_at(&self, source: usize) -> usize {
        let mut index = self
            .source_ends
            .partition_point(|&offset| offset <= source)
            .saturating_sub(1)
            .min(self.text.len());
        while !self.text.is_char_boundary(index) {
            index -= 1;
        }
        index
    }
    pub fn line_at(&self, cursor: usize) -> &Line {
        self.lines
            .iter()
            .find(|line| line.range.end >= cursor)
            .unwrap_or_else(|| self.lines.last().unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::{Kind, Projection};
    #[test]
    fn rich_projection_maps_visible_heading_and_inline_text_to_source() {
        let source = "### Heading\n\nA **bold** and `code` paragraph.\n";
        let p = Projection::new(source);
        assert_eq!(p.text, "Heading\nA bold and code paragraph.");
        assert_eq!(p.lines[0].kind, Kind::Heading(3));
        assert_eq!(p.source_at(0), 4);
        let at = p.text.find("bold").unwrap();
        assert_eq!(&source[p.source_at(at)..p.source_at(at + 3)], "bol");
        assert!(p.lines[1].spans.iter().any(|span| span.marks.bold));
    }
    #[test]
    fn enter_retains_an_editable_paragraph_between_blocks() {
        let p = Projection::new("### Short\n\n\n\nAlpha.\n");
        assert_eq!(p.text, "Short\n\nAlpha.");
        assert_eq!(p.lines[1].kind, Kind::Paragraph);
        assert_eq!(p.display_at(11), p.lines[1].range.start);
    }
    #[test]
    fn trailing_space_and_inline_delimiters_keep_caret_affinity() {
        let source = "### Short \n\nA **bold** end.\n";
        let p = Projection::new(source);
        assert!(p.text.starts_with("Short \n"));
        assert_eq!(p.display_at(source.find(" \n").unwrap() + 1), 6);
        let end = p.text.find("bold").unwrap() + 4;
        assert_eq!(&source[p.source_end(end)..p.source_at(end)], "**");
    }
    #[test]
    fn unicode_offsets_and_code_lines_are_valid() {
        let source = "# Café 🦀\n\n```rust\nlet n = 1;\nprintln!(\"{n}\");\n```\n";
        let p = Projection::new(source);
        for (index, _) in p.text.char_indices() {
            assert!(source.is_char_boundary(p.source_at(index)));
        }
        assert!(p.lines.iter().filter(|l| l.kind == Kind::Code).count() >= 2);
        assert_eq!(
            p.display_at(source.find('🦀').unwrap()),
            p.text.find('🦀').unwrap()
        );
    }
}
