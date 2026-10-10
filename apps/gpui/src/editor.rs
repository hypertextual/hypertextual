use crate::rich::{Changed, RichEditor};
use gpui_kit::*;
use htmd_vault::{Document, Vault};
use std::time::Instant;

actions!(htmd, [Save]);

/// Vault and save lifecycle around the continuous native rich editor.
pub struct Editor {
    vault: Vault,
    pub note: Option<Document>,
    input: Option<Entity<RichEditor>>,
    subscription: Option<Subscription>,
    pub status: String,
    error: String,
    open_ms: f64,
    focus: FocusHandle,
}

impl Editor {
    pub fn new(vault: Vault, cx: &mut Context<Self>) -> Self {
        Self {
            vault,
            note: None,
            input: None,
            subscription: None,
            status: "Select a note".into(),
            error: String::new(),
            open_ms: 0.,
            focus: cx.focus_handle(),
        }
    }

    pub fn open(&mut self, path: &str, window: &mut Window, cx: &mut Context<Self>) {
        if !self.save(window, cx) {
            return;
        }
        let start = Instant::now();
        match self.vault.open(path) {
            Ok(doc) => {
                let source = doc.source();
                let input = cx.new(|cx| RichEditor::new(source, cx));
                self.subscription = Some(cx.subscribe_in(
                    &input,
                    window,
                    |this, _, event: &Changed, window, cx| match event {
                        Changed::Save => {
                            this.save(window, cx);
                        }
                        Changed::Edit => {
                            if this.status != "Unsaved changes" {
                                this.status = "Unsaved changes".into();
                                cx.notify();
                            }
                        }
                    },
                ));
                window.focus(&input.read(cx).focus_handle(cx), cx);
                self.input = Some(input);
                self.note = Some(doc);
                self.error.clear();
                self.open_ms = start.elapsed().as_secs_f64() * 1000.;
                self.status = "Saved to vault".into();
            }
            Err(error) => self.error = error.to_string(),
        }
        cx.notify();
    }

    pub fn save(&mut self, _: &mut Window, cx: &mut Context<Self>) -> bool {
        if let (Some(doc), Some(input)) = (&mut self.note, &self.input) {
            let source = input.read(cx).source.clone();
            if source != doc.original {
                if let Err(error) = self.vault.save(&doc.path, &doc.original, &source) {
                    self.error = error.to_string();
                    self.status = "Edits kept in memory".into();
                    cx.notify();
                    return false;
                }
                doc.original = source;
            }
            self.status = "Saved to vault".into();
            self.error.clear();
        }
        cx.notify();
        true
    }
}

impl Render for Editor {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let path = self
            .note
            .as_ref()
            .map(|n| n.path.clone())
            .unwrap_or_else(|| "No note selected".into());
        div()
            .id("editor")
            .track_focus(&self.focus)
            .flex()
            .flex_col()
            .flex_1()
            .h_full()
            .min_w_0()
            .bg(rgb(0x191a1d))
            .text_color(rgb(0xbfc0c8))
            .text_size(px(14.))
            .on_action(cx.listener(|this, _: &Save, window, cx| {
                this.save(window, cx);
            }))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .items_center()
                    .h(px(52.))
                    .px_6()
                    .border_b_1()
                    .border_color(rgb(0x2c2d32))
                    .text_size(px(12.))
                    .child(format!("Vault / {path}"))
                    .child(
                        div()
                            .id("save")
                            .cursor_pointer()
                            .rounded_md()
                            .px_3()
                            .py_1()
                            .bg(rgb(0x292a31))
                            .child("Save  ⌘ S")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.save(window, cx);
                            })),
                    ),
            )
            .children((!self.error.is_empty()).then(|| {
                div()
                    .p_3()
                    .bg(rgb(0x482e2e))
                    .text_color(rgb(0xf4c4c4))
                    .child(self.error.clone())
            }))
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .p_6()
                    .children(self.input.as_ref().map(|input| input.clone())),
            )
            .child(
                div()
                    .flex()
                    .justify_between()
                    .px_5()
                    .py_2()
                    .border_t_1()
                    .border_color(rgb(0x2c2d32))
                    .text_size(px(10.))
                    .text_color(rgb(0x777988))
                    .child(self.status.clone())
                    .child(format!(
                        "Continuous rich editor · Open {:.1} ms",
                        self.open_ms
                    )),
            )
    }
}
