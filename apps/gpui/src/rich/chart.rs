use super::*;
use gpui_kit::component::input::{Editor, EditorState};
#[derive(Clone, Debug)]
pub(super) struct ChartNode {
    pub source_range: Range<usize>,
    pub body_range: Range<usize>,
    pub data: Result<htmd_vault::ChartSpec, String>,
}
pub(super) struct ChartEdit {
    pub input: Entity<EditorState>,
    pub(super) node: ChartNode,
    original: String,
}
impl RichEditor {
    pub(super) fn edit_chart(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let at = self.projection.line_at(self.cursor).range.start;
        let Some(node) = self.projection.charts.get(&at).cloned() else {
            return;
        };
        let body = self.source[node.body_range.clone()].to_owned();
        let input = cx.new(|cx| {
            let mut state = EditorState::new(window, cx)
                .language("json")
                .line_number(false)
                .folding(false)
                .auto_close(false)
                .smart_indent(false);
            state.set_value(body, window, cx);
            state
        });
        window.focus(&input.focus_handle(cx), cx);
        self.chart_editor = Some(ChartEdit {
            original: self.source[node.source_range.clone()].to_owned(),
            node,
            input,
        });
        self.chart_error.clear();
        self.layout_dirty = true;
        cx.notify();
    }
    pub(super) fn apply_chart(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(edit) = &self.chart_editor else {
            return;
        };
        let body = edit.input.read(cx).value().to_string();
        if let Err(error) = htmd_vault::ChartSpec::parse(&body) {
            self.chart_error = error.to_string();
            cx.notify();
            return;
        }
        if self.source.get(edit.node.source_range.clone()) != Some(edit.original.as_str()) {
            self.chart_error =
                "The note changed while editing this chart. Cancel and reopen its data.".into();
            cx.notify();
            return;
        }
        let range = edit.node.body_range.clone();
        self.checkpoint(false);
        self.replace_source(range, &(body.trim_end().to_owned() + "\n"), Some(0), cx);
        self.chart_editor = None;
        self.chart_error.clear();
        self.layout_dirty = true;
        window.focus(&self.focus, cx);
        cx.notify();
    }
    pub(super) fn chart_inspector(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let input = self.chart_editor.as_ref()?.input.clone();
        Some(
            div()
                .id("chart-inspector")
                .test_support()
                .absolute()
                .right_0()
                .top_0()
                .h_full()
                .w(px(400.))
                .p_3()
                .bg(rgb(0x27232e))
                .flex()
                .flex_col()
                .gap_3()
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                    if event.keystroke.key == "escape" {
                        this.chart_editor = None;
                        this.chart_error.clear();
                        this.layout_dirty = true;
                        window.focus(&this.focus, cx);
                        cx.notify();
                    }
                    cx.stop_propagation();
                }))
                .child("Chart data · HTMD v1")
                .child(
                    div()
                        .flex_1()
                        .min_h_0()
                        .child(Editor::new(&input).h(relative(1.))),
                )
                .child(self.chart_error.clone())
                .child(
                    div()
                        .flex()
                        .gap_3()
                        .child(
                            div()
                                .id("apply-chart")
                                .test_support()
                                .p_2()
                                .bg(rgb(0x514264))
                                .cursor_pointer()
                                .child("Apply chart")
                                .on_mouse_down(
                                    MouseButton::Left,
                                    cx.listener(|this, _, window, cx| {
                                        this.apply_chart(window, cx);
                                        cx.stop_propagation();
                                    }),
                                ),
                        )
                        .child(div().p_2().cursor_pointer().child("Cancel").on_mouse_down(
                            MouseButton::Left,
                            cx.listener(|this, _, window, cx| {
                                this.chart_editor = None;
                                this.chart_error.clear();
                                this.layout_dirty = true;
                                window.focus(&this.focus, cx);
                                cx.notify();
                                cx.stop_propagation();
                            }),
                        )),
                )
                .into_any_element(),
        )
    }
}
fn label(text: &str, origin: Point<Pixels>, color: u32, window: &mut Window, cx: &mut App) {
    let run = TextRun {
        len: text.len(),
        font: font(".SystemUIFont"),
        color: rgb(color).into(),
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    let line = window
        .text_system()
        .shape_line(text.to_owned().into(), px(12.), &[run], None);
    let _ = line.paint(origin, px(20.), TextAlign::Left, None, window, cx);
}
pub(super) fn paint_chart(
    node: &ChartNode,
    bounds: Bounds<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    window.paint_quad(fill(bounds, rgb(0x211e28)));
    let origin = bounds.origin + point(px(16.), px(10.));
    label("Edit chart data · ⌘ Enter", origin, rgb_color(), window, cx);
    let spec = match &node.data {
        Ok(spec) => spec,
        Err(error) => {
            label(
                "Invalid HTMD chart",
                origin + point(px(0.), px(30.)),
                0xefaaaa,
                window,
                cx,
            );
            label(error, origin + point(px(0.), px(55.)), 0xefaaaa, window, cx);
            return;
        }
    };
    label(
        &spec.title,
        origin + point(px(0.), px(26.)),
        0xe9e2f4,
        window,
        cx,
    );
    let colors = [0xbba7ef, 0x68c9b3, 0xe4bd70, 0xe098bb, 0x82b1ea];
    for (i, series) in spec.series.iter().enumerate() {
        label(
            &series.name,
            origin + point(px(i as f32 * 100.), px(50.)),
            colors[i],
            window,
            cx,
        );
    }
    let plot = Bounds::new(
        origin + point(px(24.), px(82.)),
        size((bounds.size.width - px(60.)).max(px(30.)), px(200.)),
    );
    let largest = spec
        .series
        .iter()
        .flat_map(|s| s.values.iter().copied())
        .fold(1.0_f64, f64::max);
    let maximum = (0..spec.labels.len())
        .map(|i| {
            spec.series
                .iter()
                .map(|series| series.values[i] / largest)
                .sum::<f64>()
        })
        .fold(1.0_f64, f64::max);
    for i in 0..=4 {
        let y = plot.origin.y + plot.size.height * (i as f32 / 4.);
        window.paint_quad(fill(
            Bounds::new(point(plot.origin.x, y), size(plot.size.width, px(1.))),
            rgb(0x3b3446),
        ));
    }
    let group = plot.size.width / spec.labels.len() as f32;
    let bar = group * 0.72;
    for (i, name) in spec.labels.iter().enumerate() {
        let mut stacked = px(0.);
        for (j, series) in spec.series.iter().enumerate() {
            let height = plot.size.height * (series.values[i] / largest / maximum) as f32;
            window.paint_quad(fill(
                Bounds::new(
                    point(
                        plot.origin.x + group * (i as f32 + 0.14),
                        plot.origin.y + plot.size.height - stacked - height,
                    ),
                    size((bar - px(2.)).max(px(1.)), height),
                ),
                rgb(colors[j]),
            ));
            stacked += height;
        }
        label(
            name,
            point(
                plot.origin.x + group * i as f32,
                plot.origin.y + plot.size.height + px(5.),
            ),
            0xbab0c9,
            window,
            cx,
        );
    }
    label(
        &format!("0 – {}", largest * maximum),
        origin + point(px(0.), px(72.)),
        0x968aa9,
        window,
        cx,
    );
}
fn rgb_color() -> u32 {
    0xbba7ef
}
