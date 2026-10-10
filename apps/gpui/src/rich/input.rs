use super::*;
impl RichEditor {
    fn from_utf16(&self, at: usize) -> usize {
        let mut count = 0;
        self.projection
            .text
            .char_indices()
            .find_map(|(i, ch)| {
                if count >= at {
                    Some(i)
                } else {
                    count += ch.len_utf16();
                    None
                }
            })
            .unwrap_or(self.projection.text.len())
    }
    fn to_utf16(&self, at: usize) -> usize {
        self.projection.text[..at].encode_utf16().count()
    }
    fn from_range(&self, range: Range<usize>) -> Range<usize> {
        self.from_utf16(range.start)..self.from_utf16(range.end)
    }
    fn to_range(&self, range: Range<usize>) -> Range<usize> {
        self.to_utf16(range.start)..self.to_utf16(range.end)
    }
}
impl EntityInputHandler for RichEditor {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        actual: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let range = self.from_range(range);
        *actual = Some(self.to_range(range.clone()));
        Some(self.projection.text[range].to_owned())
    }
    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.to_range(self.selection()),
            reversed: self.cursor < self.anchor,
        })
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked.clone().map(|r| self.to_range(r))
    }
    fn unmark_text(&mut self, _: &mut Window, cx: &mut Context<Self>) {
        self.marked = None;
        cx.notify();
    }
    fn replace_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let range = range
            .map(|r| self.from_range(r))
            .or(self.marked.clone())
            .unwrap_or_else(|| self.selection());
        self.replace(range, text, cx);
        self.marked = None;
    }
    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let range = range
            .map(|r| self.from_range(r))
            .or(self.marked.clone())
            .unwrap_or_else(|| self.selection());
        let start = range.start;
        self.replace(range, text, cx);
        self.marked = (!text.is_empty()).then_some(start..self.cursor);
        if let Some(selected) = selected {
            let start16 = self.to_utf16(start);
            let range = self.from_range(start16 + selected.start..start16 + selected.end);
            self.anchor = range.start;
            self.cursor = range.end;
        }
    }
    fn bounds_for_range(
        &mut self,
        range: Range<usize>,
        _: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let range = self.from_range(range);
        let (position, height) = self.caret_position(range.start)?;
        Some(Bounds::new(
            self.bounds?.origin + position - point(px(0.), self.scroll),
            size(px(2.), height),
        ))
    }
    fn character_index_for_point(
        &mut self,
        position: Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        Some(self.to_utf16(self.hit(position)))
    }
}
