//! One native input surface. Rendered Markdown and the OS caret share the same
//! shaped lines; source offsets retain the original Markdown outside edits.
mod chart;
mod components;
mod input;
mod layout;
mod navigation;
mod projection;
#[cfg(test)]
mod tests;

use gpui_kit::*;
use projection::{Kind, Projection};
use std::{ops::Range, time::Instant};
use unicode_segmentation::UnicodeSegmentation;

pub enum Changed {
    Edit,
    Save,
}
impl EventEmitter<Changed> for RichEditor {}
#[derive(Clone)]
struct Snapshot {
    source: String,
    cursor: usize,
    anchor: usize,
}

pub struct RichEditor {
    pub source: String,
    bench_marker: u32,
    projection: Projection,
    focus: FocusHandle,
    cursor: usize,
    anchor: usize,
    marked: Option<Range<usize>>,
    chart_editor: Option<chart::ChartEdit>,
    chart_error: String,
    rows: Vec<layout::Row>,
    layout_dirty: bool,
    bounds: Option<Bounds<Pixels>>,
    scroll: Pixels,
    total_height: Pixels,
    dragging: bool,
    reveal: bool,
    goal_x: Option<Pixels>,
    history: Vec<Snapshot>,
    redo: Vec<Snapshot>,
    last_edit: Option<Instant>,
    slash_selected: usize,
    slash_dismissed: bool,
}

impl RichEditor {
    pub fn new(source: String, cx: &mut Context<Self>) -> Self {
        let projection = Projection::new(&source);
        Self {
            source,
            bench_marker: crate::benchmark::next(),
            projection,
            focus: cx.focus_handle(),
            cursor: 0,
            anchor: 0,
            marked: None,
            chart_editor: None,
            chart_error: String::new(),
            rows: vec![],
            layout_dirty: true,
            bounds: None,
            scroll: px(0.),
            total_height: px(0.),
            dragging: false,
            reveal: true,
            goal_x: None,
            history: vec![],
            redo: vec![],
            last_edit: None,
            slash_selected: 0,
            slash_dismissed: false,
        }
    }
    fn selection(&self) -> Range<usize> {
        self.anchor.min(self.cursor)..self.anchor.max(self.cursor)
    }
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            source: self.source.clone(),
            cursor: self.cursor,
            anchor: self.anchor,
        }
    }
    fn checkpoint(&mut self, group: bool) {
        if !group || self.last_edit.is_none_or(|t| t.elapsed().as_millis() > 500) {
            self.history.push(self.snapshot());
            if self.history.len() > 100 {
                self.history.remove(0);
            }
        }
        self.last_edit = Some(Instant::now());
        self.redo.clear();
    }
    fn replace(&mut self, range: Range<usize>, text: &str, cx: &mut Context<Self>) {
        self.checkpoint(!text.contains('\n') && range.is_empty());
        let source_range =
            if range.start == 0 && range.end == self.projection.text.len() && !range.is_empty() {
                0..self.source.len()
            } else if range.is_empty() {
                let line = self.projection.line_at(range.start);
                let at = if line.range.start == range.start {
                    self.projection.source_at(range.start)
                } else {
                    self.projection.source_end(range.start)
                };
                at..at
            } else {
                self.projection.source_at(range.start)..self.projection.source_end(range.end)
            };
        self.replace_source(source_range, text, None, cx);
    }
    fn replace_source(
        &mut self,
        range: Range<usize>,
        text: &str,
        caret: Option<usize>,
        cx: &mut Context<Self>,
    ) {
        let at = range.start + caret.unwrap_or(text.len());
        self.bench_marker = crate::benchmark::next();
        self.source.replace_range(range, text);
        self.projection = Projection::new(&self.source);
        self.layout_dirty = true;
        self.cursor = self.projection.display_at(at);
        self.anchor = self.cursor;
        self.reveal = true;
        self.goal_x = None;
        self.slash_selected = 0;
        self.slash_dismissed = false;
        cx.emit(Changed::Edit);
        cx.notify();
    }
}

impl Focusable for RichEditor {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}
impl Render for RichEditor {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let menu = self.slash().and_then(|(_, items)| {
            self.caret_position(self.cursor)
                .or_else(|| {
                    self.rows
                        .last()
                        .and_then(|row| self.caret_position(row.range.end))
                })
                .map(|(pos, height)| (items, pos, height))
        });
        div()
            .id("rich-note")
            .relative()
            .size_full()
            .key_context("RichNote")
            .track_focus(&self.focus)
            .cursor_text()
            .on_key_down(cx.listener(Self::key))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, window, cx| {
                    window.focus(&this.focus, cx);
                    this.dragging = true;
                    let at = this.hit(event.position);
                    this.move_to(at, event.modifiers.shift, cx);
                    let edit_hit = this.bounds.is_some_and(|bounds| {
                        this.rows.iter().any(|row| {
                            row.chart.is_some()
                                && event.position.y >= bounds.origin.y + row.y - this.scroll
                                && event.position.y
                                    < bounds.origin.y + row.y - this.scroll + px(36.)
                        })
                    });
                    if edit_hit {
                        this.edit_chart(window, cx);
                        this.dragging = false;
                        cx.stop_propagation();
                        return;
                    }
                    if event.click_count == 2 && this.projection.line_at(at).kind == Kind::Chart {
                        this.edit_chart(window, cx);
                        this.dragging = false;
                        return;
                    }
                    if event.click_count == 2 {
                        let text = &this.projection.text;
                        if let Some((start, word)) = text
                            .unicode_word_indices()
                            .find(|(start, word)| *start <= at && *start + word.len() >= at)
                        {
                            this.anchor = start;
                            this.cursor = start + word.len();
                        }
                    }
                    if event.click_count >= 3 {
                        let range = this.projection.line_at(at).range.clone();
                        this.anchor = range.start;
                        this.cursor = range.end;
                    }
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if this.dragging {
                    this.move_to(this.hit(event.position), true, cx);
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_scroll_wheel(cx.listener(|this, event: &ScrollWheelEvent, _, cx| {
                this.bench_marker = crate::benchmark::next();
                let height = this.bounds.map(|b| b.size.height).unwrap_or(px(0.));
                this.scroll = (this.scroll - event.delta.pixel_delta(px(24.)).y)
                    .max(px(0.))
                    .min((this.total_height - height).max(px(0.)));
                this.reveal = false;
                cx.notify();
                cx.stop_propagation();
            }))
            .child(layout::RichElement { input: cx.entity() })
            .children(self.chart_inspector(cx))
            .children(menu.map(|(items, pos, height)| {
                let top = (pos.y - self.scroll + height).max(px(0.)).min(
                    self.bounds
                        .map(|b| b.size.height - px(250.))
                        .unwrap_or(px(0.))
                        .max(px(0.)),
                );
                div()
                    .id("component-menu")
                    .test_support()
                    .flex()
                    .flex_col()
                    .absolute()
                    .left(pos.x)
                    .top(top)
                    .w(px(230.))
                    .p_2()
                    .bg(rgb(0x27232e))
                    .border_1()
                    .border_color(rgb(0x605079))
                    .rounded_md()
                    .children(items.into_iter().enumerate().map(|(i, item)| {
                        div()
                            .id(("component", i))
                            .test_support()
                            .px_3()
                            .py_2()
                            .rounded_sm()
                            .text_size(px(12.))
                            .bg(if i == self.slash_selected {
                                rgb(0x514264)
                            } else {
                                rgb(0x27232e)
                            })
                            .child(item.title)
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.insert_component(item, cx);
                                    cx.stop_propagation();
                                }),
                            )
                    }))
            }))
    }
}
