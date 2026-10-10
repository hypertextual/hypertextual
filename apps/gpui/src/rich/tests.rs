use super::RichEditor;
use gpui_kit::test::TestWindowExt;
use gpui_kit::{
    AppContext, Bounds, Entity, TestAppContext, WindowBounds, WindowOptions, point, px, size,
};

fn editor(
    cx: &mut TestAppContext,
    source: &str,
) -> (gpui_kit::AnyWindowHandle, Entity<RichEditor>) {
    cx.update(gpui_kit::init);
    cx.update(|cx| {
        let (window, editor) = gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(600.), px(400.)),
                ))),
                ..Default::default()
            },
            cx,
            |_, cx| cx.new(|cx| RichEditor::new(source.into(), cx)),
        )
        .unwrap();
        (window, editor)
    })
}

#[gpui_kit::test]
fn arrows_cross_paragraph_spacing_and_enter_creates_a_new_editable_line(cx: &mut TestAppContext) {
    let (handle, editor) = editor(cx, "### Short\n\nAlpha paragraph.\n\nBeta paragraph.\n");
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        editor.update(cx, |input, cx| {
            window.focus(&input.focus, cx);
            input.move_to(8, false, cx);
        });
        window.render_frame(cx);
        window.press("up", cx);
        assert!(
            editor.read(cx).cursor <= 5,
            "Up must cross the paragraph gap"
        );
        window.press("down", cx);
        assert!(
            editor.read(cx).cursor >= 6,
            "Down must return to the paragraph"
        );
        window.press("cmd-up", cx);
        window.press("cmd-right", cx);
        window.press("enter", cx);
        let input = editor.read(cx);
        assert_eq!(
            input.projection.line_at(input.cursor).kind,
            super::projection::Kind::Paragraph
        );
        assert_eq!(input.projection.line_at(input.cursor).range.len(), 0);
        window.input("New paragraph.", cx);
        assert_eq!(
            editor.read(cx).source,
            "### Short\n\nNew paragraph.\n\nAlpha paragraph.\n\nBeta paragraph.\n"
        );
    })
    .unwrap();
}

#[gpui_kit::test]
fn typing_spaces_and_deleting_emphasis_text_preserve_markdown(cx: &mut TestAppContext) {
    let (handle, editor) = editor(cx, "### Short\n\nAlpha **bold** paragraph.\n");
    cx.update_window(handle, |_, window, cx| {
        editor.update(cx, |input, cx| {
            window.focus(&input.focus, cx);
        });
        window.render_frame(cx);
        window.press("cmd-right", cx);
        window.input(" more words", cx);
        assert_eq!(
            editor.read(cx).source,
            "### Short more words\n\nAlpha **bold** paragraph.\n"
        );
        editor.update(cx, |input, cx| {
            let at = input.projection.text.find("bold").unwrap() + 4;
            input.move_to(at, false, cx);
        });
        window.render_frame(cx);
        window.press("backspace", cx);
        assert!(editor.read(cx).source.contains("**bol**"));
        window.press("cmd-z", cx);
        assert!(editor.read(cx).source.contains("**bold**"));
        window.press("cmd-a", cx);
        window.input("Replaced.", cx);
        assert_eq!(editor.read(cx).projection.text, "Replaced.");
    })
    .unwrap();
}

#[gpui_kit::test]
fn slash_menu_keyboard_selection_inserts_a_rich_heading(cx: &mut TestAppContext) {
    let (handle, editor) = editor(cx, "");
    cx.update_window(handle, |_, window, cx| {
        editor.update(cx, |input, cx| window.focus(&input.focus, cx));
        window.render_frame(cx);
        window.input("/", cx);
        window.render_frame(cx);
        assert!(
            window.find("component-menu").visible(),
            "Typing / must display a menu, not just enable invisible commands"
        );
        assert!(window.find(("component", 0usize)).visible());
        window.input("heading", cx);
        window.render_frame(cx);
        assert!(window.find("component-menu").visible());
        window.press("down", cx);
        window.press("down", cx);
        window.press("enter", cx);
        assert_eq!(
            editor.read(cx).projection.lines[0].kind,
            super::projection::Kind::Heading(3)
        );
    })
    .unwrap();
}

#[gpui_kit::test]
fn chart_is_a_rich_atomic_node_with_validated_data_editing_and_undo(cx: &mut TestAppContext) {
    let source = include_str!("../../../../vault/Examples/Chart.htmd");
    let (handle, entity) = editor(cx, source);
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let at = *entity.read(cx).projection.charts.keys().next().unwrap();
        assert_eq!(
            entity.read(cx).projection.charts.len(),
            1,
            "The syntax example stays ordinary code"
        );
        assert!(
            entity
                .read(cx)
                .rows
                .iter()
                .any(|row| row.chart.is_some() && row.height == px(340.))
        );
        entity.update(cx, |input, cx| {
            window.focus(&input.focus, cx);
            input.move_to(at, false, cx);
        });
        window.press("cmd-enter", cx);
        window.render_frame(cx);
        assert!(window.find("chart-inspector").visible());
        let draft = entity.read(cx).chart_editor.as_ref().unwrap().input.clone();
        draft.update(cx, |input, cx| input.set_value("{", window, cx));
        entity.update(cx, |input, cx| input.apply_chart(window, cx));
        assert_eq!(entity.read(cx).source, source);
        assert!(!entity.read(cx).chart_error.is_empty());
        let body = source[entity
            .read(cx)
            .chart_editor
            .as_ref()
            .unwrap()
            .node
            .body_range
            .clone()]
        .replace("Notes written this week", "Changed chart");
        draft.update(cx, |input, cx| input.set_value(body, window, cx));
        entity.update(cx, |input, cx| input.apply_chart(window, cx));
        assert!(entity.read(cx).source.contains("Changed chart"));
        assert!(entity.read(cx).chart_editor.is_none());
        assert_eq!(
            entity.read(cx).projection.charts[&at]
                .data
                .as_ref()
                .unwrap()
                .title,
            "Changed chart"
        );
        window.press("cmd-z", cx);
        assert_eq!(entity.read(cx).source, source);
    })
    .unwrap();
}

#[gpui_kit::test]
fn slash_chart_is_visible_and_inserts_a_custom_node(cx: &mut TestAppContext) {
    let (handle, entity) = editor(cx, "");
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        entity.update(cx, |input, cx| window.focus(&input.focus, cx));
        window.input("/chart", cx);
        window.render_frame(cx);
        assert!(window.find("component-menu").visible());
        window.press("enter", cx);
        window.render_frame(cx);
        assert_eq!(entity.read(cx).projection.charts.len(), 1);
        assert!(entity.read(cx).source.starts_with("```htmd:chart"));
        window.press("right", cx);
        window.press("enter", cx);
        window.input("After chart", cx);
        assert!(entity.read(cx).source.contains("After chart"));
        assert!(
            entity
                .read(cx)
                .projection
                .charts
                .values()
                .all(|chart| chart.data.is_ok())
        );
    })
    .unwrap();
}
