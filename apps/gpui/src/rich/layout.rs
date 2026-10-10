use super::*;
#[derive(Clone)]
pub(super) struct Row {
    pub range: Range<usize>,
    pub shaped: std::sync::Arc<WrappedLine>,
    pub x: Pixels,
    pub y: Pixels,
    pub height: Pixels,
    pub line_height: Pixels,
    pub width: Pixels,
    pub chart: Option<chart::ChartNode>,
    marks: Vec<(usize, projection::Marks)>,
    kind: Kind,
    marker: String,
}
pub(super) struct RichElement {
    pub input: Entity<RichEditor>,
}
impl IntoElement for RichElement {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}
impl Element for RichElement {
    type RequestLayoutState = ();
    type PrepaintState = ();
    fn id(&self) -> Option<ElementId> {
        None
    }
    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }
    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        style.size.height = relative(1.).into();
        (window.request_layout(style, [], cx), ())
    }
    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.input.update(cx, |input, cx| {
            let reposition_menu = input.layout_dirty && input.slash().is_some();
            // GPUI's text system caches shaping. Keep these identical wrapped
            // lines for painting, mouse hit testing and native input geometry.
            if input.layout_dirty
                || input
                    .bounds
                    .is_none_or(|previous| previous.size.width != bounds.size.width)
            {
                let previous_rows = std::mem::take(&mut input.rows);
                let mut y = px(8.);
                let mut rows = vec![];
                for (index, line) in input.projection.lines.iter().enumerate() {
                    let font_size = match line.kind {
                        Kind::Heading(1) => 32.,
                        Kind::Heading(2) => 23.,
                        Kind::Heading(3) => 19.,
                        Kind::Heading(_) => 16.,
                        _ => 14.,
                    };
                    let line_height = px(if matches!(line.kind, Kind::Heading(_)) {
                        font_size * 1.35
                    } else {
                        24.
                    });
                    let x = px(
                        if matches!(
                            line.kind,
                            Kind::Quote | Kind::List | Kind::Code | Kind::Table
                        ) {
                            48.
                        } else {
                            32.
                        },
                    );
                    let marks: Vec<_> = line
                        .spans
                        .iter()
                        .map(|span| (span.range.len(), span.marks))
                        .collect();
                    let shaped = if let Some(previous) = previous_rows.get(index).filter(|row| {
                        row.kind == line.kind
                            && row.marks == marks
                            && row.shaped.text.as_ref()
                                == &input.projection.text[line.range.clone()]
                            && input
                                .bounds
                                .is_some_and(|previous| previous.size.width == bounds.size.width)
                    }) {
                        previous.shaped.clone()
                    } else {
                        let text: SharedString =
                            input.projection.text[line.range.clone()].to_owned().into();
                        let mut runs = vec![];
                        for span in &line.spans {
                            let mono = span.marks.code || line.kind == Kind::Code;
                            let mut font = font(if mono { "Menlo" } else { ".AppleSystemUIFont" });
                            if span.marks.bold || matches!(line.kind, Kind::Heading(_)) {
                                font = font.bold();
                            }
                            if span.marks.italic {
                                font = font.italic();
                            }
                            runs.push(TextRun {
                                len: span.range.len(),
                                font,
                                color: if span.marks.code || span.marks.link {
                                    rgb(0xc7afea).into()
                                } else if matches!(line.kind, Kind::Heading(_)) {
                                    rgb(0xe8e5ef).into()
                                } else {
                                    rgb(0xbfc0c8).into()
                                },
                                background_color: span.marks.code.then(|| rgb(0x302936).into()),
                                underline: span.marks.link.then_some(UnderlineStyle {
                                    color: None,
                                    thickness: px(1.),
                                    wavy: false,
                                }),
                                strikethrough: span.marks.strike.then_some(StrikethroughStyle {
                                    color: None,
                                    thickness: px(1.),
                                }),
                            });
                        }
                        // Empty paragraphs still have a shaped line and a native caret.
                        let shaped = window
                            .text_system()
                            .shape_text(
                                text,
                                px(font_size),
                                &runs,
                                Some((bounds.size.width - x - px(20.)).max(px(40.))),
                                None,
                            )
                            .expect("shape rich text")
                            .into_iter()
                            .next()
                            .expect("one logical line");
                        std::sync::Arc::new(shaped)
                    };
                    let chart = input.projection.charts.get(&line.range.start).cloned();
                    let height = if chart.is_some() {
                        px(340.)
                    } else {
                        shaped.size(line_height).height.max(line_height)
                    };
                    rows.push(Row {
                        range: line.range.clone(),
                        shaped,
                        marks,
                        x,
                        y,
                        height,
                        line_height,
                        width: (bounds.size.width
                            - x
                            - px(20.)
                            - if chart.is_some() && input.chart_editor.is_some() {
                                px(410.)
                            } else {
                                px(0.)
                            })
                        .max(px(40.)),
                        chart,
                        kind: line.kind,
                        marker: line.marker.clone(),
                    });
                    y += height
                        + px(match line.kind {
                            Kind::List | Kind::Code | Kind::Table => 2.,
                            _ => 12.,
                        });
                }
                input.rows = rows;
                input.total_height = y + px(40.);
                input.layout_dirty = false;
            }
            input.bounds = Some(bounds);
            if input.reveal {
                if let Some((caret, height)) = input.caret_position(input.cursor) {
                    if caret.y < input.scroll {
                        input.scroll = caret.y;
                    }
                    if caret.y + height > input.scroll + bounds.size.height - px(8.) {
                        input.scroll = caret.y + height - bounds.size.height + px(8.);
                    }
                }
                input.reveal = false;
            }
            if reposition_menu {
                cx.notify();
            }
            input.scroll = input
                .scroll
                .max(px(0.))
                .min((input.total_height - bounds.size.height).max(px(0.)));
        });
    }
    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        let input = self.input.read(cx);
        let focus = input.focus.clone();
        let rows = input.rows.clone();
        let scroll = input.scroll;
        let selection = input.selection();
        let cursor = input.cursor;
        let marked = input.marked.clone();
        let bench_marker = input.bench_marker;
        window.handle_input(
            &focus,
            ElementInputHandler::new(bounds, self.input.clone()),
            cx,
        );
        window.with_content_mask(Some(ContentMask { bounds }), |window| {
            for row in &rows {
                let origin = bounds.origin + point(row.x, row.y - scroll);
                if origin.y + row.height < bounds.top() || origin.y > bounds.bottom() {
                    continue;
                }
                match row.kind {
                    Kind::Code | Kind::Quote | Kind::Table => {
                        window.paint_quad(fill(
                            Bounds::new(
                                point(origin.x - px(12.), origin.y),
                                size(bounds.size.width - row.x, row.height + px(2.)),
                            ),
                            rgb(if row.kind == Kind::Code {
                                0x121317
                            } else {
                                0x23212a
                            }),
                        ));
                        if row.kind == Kind::Quote {
                            window.paint_quad(fill(
                                Bounds::new(
                                    point(origin.x - px(12.), origin.y),
                                    size(px(3.), row.height + px(2.)),
                                ),
                                rgb(0x9e83cd),
                            ));
                        }
                        if row.kind == Kind::Table {
                            window.paint_quad(fill(
                                Bounds::new(
                                    point(origin.x - px(12.), origin.y + row.height),
                                    size(bounds.size.width - row.x, px(1.)),
                                ),
                                rgb(0x41414b),
                            ));
                        }
                    }
                    Kind::Rule => window.paint_quad(fill(
                        Bounds::new(
                            point(origin.x, origin.y + px(12.)),
                            size(bounds.size.width - row.x - px(20.), px(1.)),
                        ),
                        rgb(0x45434d),
                    )),
                    _ => {}
                }
                if !row.marker.is_empty()
                    && (row.kind == Kind::List
                        || (matches!(row.kind, Kind::Heading(_))
                            && focus.is_focused(window)
                            && cursor >= row.range.start
                            && cursor <= row.range.end))
                {
                    let run = TextRun {
                        len: row.marker.len(),
                        font: font("Menlo"),
                        color: rgb(0x9680b4).into(),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    };
                    let marker = window.text_system().shape_line(
                        row.marker.clone().into(),
                        px(if row.kind == Kind::List { 14. } else { 10. }),
                        &[run],
                        None,
                    );
                    let _ = marker.paint(
                        point(origin.x - marker.width - px(8.), origin.y),
                        row.line_height,
                        TextAlign::Left,
                        None,
                        window,
                        cx,
                    );
                }
                if selection.start <= row.range.end
                    && selection.end >= row.range.start
                    && !selection.is_empty()
                {
                    let start = selection.start.max(row.range.start) - row.range.start;
                    let end = selection.end.min(row.range.end) - row.range.start;
                    let a = row
                        .shaped
                        .position_for_index(start, row.line_height)
                        .unwrap_or_default();
                    let b = row
                        .shaped
                        .position_for_index(end, row.line_height)
                        .unwrap_or_default();
                    let mut y = a.y;
                    while y <= b.y {
                        let left = if y == a.y { a.x } else { px(0.) };
                        let right = if y == b.y {
                            b.x
                        } else {
                            bounds.size.width - row.x - px(20.)
                        };
                        window.paint_quad(fill(
                            Bounds::new(
                                origin + point(left, y),
                                size((right - left).max(px(2.)), row.line_height),
                            ),
                            rgba(0x8060b966),
                        ));
                        y += row.line_height;
                    }
                }
                if let Some(chart) = &row.chart {
                    chart::paint_chart(
                        chart,
                        Bounds::new(origin, size(row.width, row.height)),
                        window,
                        cx,
                    );
                    if focus.is_focused(window)
                        && cursor >= row.range.start
                        && cursor <= row.range.end
                    {
                        window.paint_quad(fill(
                            Bounds::new(origin, size(px(2.), row.height)),
                            rgb(0xbba7ef),
                        ));
                    }
                    continue;
                }
                let _ = row.shaped.paint_background(
                    origin,
                    row.line_height,
                    TextAlign::Left,
                    None,
                    window,
                    cx,
                );
                let _ =
                    row.shaped
                        .paint(origin, row.line_height, TextAlign::Left, None, window, cx);
                if let Some(marked) = &marked {
                    if marked.start >= row.range.start && marked.end <= row.range.end {
                        let a = row
                            .shaped
                            .position_for_index(marked.start - row.range.start, row.line_height)
                            .unwrap_or_default();
                        let b = row
                            .shaped
                            .position_for_index(marked.end - row.range.start, row.line_height)
                            .unwrap_or_default();
                        window.paint_quad(fill(
                            Bounds::new(
                                origin + a + point(px(0.), row.line_height - px(2.)),
                                size((b.x - a.x).max(px(2.)), px(1.)),
                            ),
                            rgb(0xbba7ef),
                        ));
                    }
                }
                if focus.is_focused(window)
                    && selection.is_empty()
                    && cursor >= row.range.start
                    && cursor <= row.range.end
                {
                    let pos = row
                        .shaped
                        .position_for_index(cursor - row.range.start, row.line_height)
                        .unwrap_or_default();
                    window.paint_quad(fill(
                        Bounds::new(
                            origin + pos + point(px(0.), px(2.)),
                            size(px(1.5), row.line_height - px(4.)),
                        ),
                        rgb(0xd7c0ff),
                    ));
                }
            }
        });
        if bench_marker != 0 {
            let red = 32 + (bench_marker % 16) * 12;
            window.paint_quad(fill(
                Bounds::new(bounds.origin, size(px(16.), px(16.))),
                rgb((red << 16) | (220 << 8) | 90),
            ));
        }
    }
}
