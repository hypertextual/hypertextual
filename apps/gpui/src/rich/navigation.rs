use super::*;
use unicode_segmentation::UnicodeSegmentation;
impl RichEditor {
    pub(super) fn move_to(&mut self, at: usize, select: bool, cx: &mut Context<Self>) {
        self.cursor = at.min(self.projection.text.len());
        if !select {
            self.anchor = self.cursor;
        }
        self.last_edit = None;
        self.bench_marker = crate::benchmark::next();
        self.reveal = true;
        self.marked = None;
        cx.notify();
    }
    pub(super) fn previous(&self) -> usize {
        self.projection
            .text
            .grapheme_indices(true)
            .rev()
            .find_map(|(i, _)| (i < self.cursor).then_some(i))
            .unwrap_or(0)
    }
    pub(super) fn next(&self) -> usize {
        self.projection
            .text
            .grapheme_indices(true)
            .find_map(|(i, _)| (i > self.cursor).then_some(i))
            .unwrap_or(self.projection.text.len())
    }
    pub(super) fn hit(&self, position: Point<Pixels>) -> usize {
        let Some(bounds) = self.bounds else {
            return 0;
        };
        let local = position - bounds.origin + point(px(0.), self.scroll);
        let Some(row) = self
            .rows
            .iter()
            .find(|row| local.y < row.y + row.height)
            .or(self.rows.last())
        else {
            return 0;
        };
        if row.chart.is_some() {
            return if local.x - row.x < row.width / 2. {
                row.range.start
            } else {
                row.range.end
            };
        }
        let i = row
            .shaped
            .closest_index_for_position(point(local.x - row.x, local.y - row.y), row.line_height)
            .unwrap_or_else(|i| i);
        row.range.start + i.min(row.range.len())
    }
    pub(super) fn caret_position(&self, index: usize) -> Option<(Point<Pixels>, Pixels)> {
        let row = self.rows.iter().find(|row| row.range.end >= index)?;
        if row.chart.is_some() {
            return Some((
                point(
                    row.x
                        + if index == row.range.start {
                            px(0.)
                        } else {
                            row.width
                        },
                    row.y,
                ),
                row.height,
            ));
        }
        let pos = row
            .shaped
            .position_for_index(index.saturating_sub(row.range.start), row.line_height)?;
        Some((point(row.x, row.y) + pos, row.line_height))
    }
    pub(super) fn vertical(&mut self, down: bool, select: bool, cx: &mut Context<Self>) {
        let Some((position, height)) = self.caret_position(self.cursor) else {
            return;
        };
        let x = self.goal_x.unwrap_or(position.x);
        self.goal_x = Some(x);
        let Some(bounds) = self.bounds else {
            return;
        };
        let Some(row_index) = self
            .rows
            .iter()
            .position(|row| row.range.end >= self.cursor)
        else {
            return;
        };
        let row = &self.rows[row_index];
        let y = if down {
            if position.y + height < row.y + row.height {
                position.y + height + height / 2.
            } else if let Some(next) = self.rows.get(row_index + 1) {
                next.y + next.line_height / 2.
            } else {
                self.move_to(self.projection.text.len(), select, cx);
                return;
            }
        } else if position.y > row.y {
            position.y - height / 2.
        } else if row_index > 0 {
            let previous = &self.rows[row_index - 1];
            previous.y + previous.height - previous.line_height / 2.
        } else {
            self.move_to(0, select, cx);
            return;
        };
        let target = self.hit(bounds.origin + point(x, y - self.scroll));
        self.move_to(target, select, cx);
    }
    pub(super) fn key(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = event.keystroke.key.as_str();
        let modifiers = event.keystroke.modifiers;
        if let Some((_, items)) = self.slash() {
            match key {
                "up" | "down" => {
                    let len = items.len();
                    if len > 0 {
                        self.slash_selected = if key == "down" {
                            (self.slash_selected + 1) % len
                        } else {
                            (self.slash_selected + len - 1) % len
                        };
                    }
                    cx.notify();
                    cx.stop_propagation();
                    return;
                }
                "enter" | "tab" if !items.is_empty() => {
                    let command = items[self.slash_selected.min(items.len() - 1)];
                    self.insert_component(command, cx);
                    cx.stop_propagation();
                    return;
                }
                "escape" => {
                    self.slash_dismissed = true;
                    cx.notify();
                    cx.stop_propagation();
                    return;
                }
                _ => {}
            }
        }
        let command = modifiers.platform;
        if command && key == "enter" && self.projection.line_at(self.cursor).kind == Kind::Chart {
            self.edit_chart(window, cx);
            cx.stop_propagation();
            return;
        }
        if key == "escape" && self.chart_editor.is_some() {
            self.chart_editor = None;
            self.chart_error.clear();
            self.layout_dirty = true;
            window.focus(&self.focus, cx);
            cx.notify();
            cx.stop_propagation();
            return;
        }

        if command {
            match key {
                "s" => {
                    cx.emit(Changed::Save);
                }
                "a" => {
                    self.anchor = 0;
                    self.cursor = self.projection.text.len();
                    self.reveal = true;
                    cx.notify();
                }
                "c" | "x" => {
                    let range = self.selection();
                    if !range.is_empty() {
                        cx.write_to_clipboard(ClipboardItem::new_string(
                            self.projection.text[range.clone()].to_string(),
                        ));
                        if key == "x" {
                            self.replace(range, "", cx);
                        }
                    }
                }
                "v" => {
                    if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                        self.replace(self.selection(), &text, cx);
                    }
                }
                "z" => {
                    let current = self.snapshot();
                    let snapshot = if modifiers.shift {
                        self.redo.pop()
                    } else {
                        self.history.pop()
                    };
                    if let Some(snapshot) = snapshot {
                        if modifiers.shift {
                            self.history.push(current);
                        } else {
                            self.redo.push(current);
                        }
                        self.source = snapshot.source;
                        self.projection = Projection::new(&self.source);
                        self.layout_dirty = true;
                        self.cursor = snapshot.cursor;
                        self.anchor = snapshot.anchor;
                        self.reveal = true;
                        self.last_edit = None;
                        cx.emit(Changed::Edit);
                        cx.notify();
                    }
                }
                "up" => self.move_to(0, modifiers.shift, cx),
                "down" => self.move_to(self.projection.text.len(), modifiers.shift, cx),
                "left" => self.move_to(
                    self.projection.line_at(self.cursor).range.start,
                    modifiers.shift,
                    cx,
                ),
                "right" => self.move_to(
                    self.projection.line_at(self.cursor).range.end,
                    modifiers.shift,
                    cx,
                ),
                _ => return,
            }
            cx.stop_propagation();
            return;
        }
        self.goal_x = if key == "up" || key == "down" {
            self.goal_x
        } else {
            None
        };
        match key {
            "left" | "right" => {
                let at = if !modifiers.shift && !self.selection().is_empty() {
                    if key == "left" {
                        self.selection().start
                    } else {
                        self.selection().end
                    }
                } else if modifiers.alt {
                    let text = &self.projection.text;
                    if key == "left" {
                        text[..self.cursor]
                            .unicode_word_indices()
                            .last()
                            .map(|(i, _)| i)
                            .unwrap_or(0)
                    } else {
                        text[self.cursor..]
                            .unicode_word_indices()
                            .next()
                            .map(|(i, w)| self.cursor + i + w.len())
                            .unwrap_or(text.len())
                    }
                } else if key == "left" {
                    self.previous()
                } else {
                    self.next()
                };
                self.move_to(at, modifiers.shift, cx);
            }
            "up" | "down" => self.vertical(key == "down", modifiers.shift, cx),
            "home" => self.move_to(
                self.projection.line_at(self.cursor).range.start,
                modifiers.shift,
                cx,
            ),
            "end" => self.move_to(
                self.projection.line_at(self.cursor).range.end,
                modifiers.shift,
                cx,
            ),
            "backspace" | "delete" => {
                let range = if self.selection().is_empty() {
                    if key == "backspace" {
                        self.previous()..self.cursor
                    } else {
                        self.cursor..self.next()
                    }
                } else {
                    self.selection()
                };
                if !range.is_empty() {
                    self.replace(range, "", cx);
                }
            }
            "enter" => {
                let line = self.projection.line_at(self.cursor);
                let text = match line.kind {
                    Kind::Code => "\n",
                    Kind::List => {
                        if line.marker == "1." {
                            "\n1. "
                        } else if line.marker == "☐" || line.marker == "☑" {
                            "\n- [ ] "
                        } else {
                            "\n- "
                        }
                    }
                    Kind::Quote => "\n> ",
                    _ => "\n\n",
                };
                self.replace(self.selection(), text, cx);
            }
            "tab" => self.replace(self.selection(), "    ", cx),
            _ => return,
        }
        cx.stop_propagation();
        let _ = window;
    }
}
