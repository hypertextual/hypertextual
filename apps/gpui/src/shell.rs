use crate::editor::Editor;
use gpui_kit::*;
use htmd_vault::{Entry, Vault};
use std::collections::HashSet;

actions!(htmd, [FocusFiles]);

pub struct Shell {
    tree_focus: FocusHandle,
    focused_path: String,
    entries: Vec<Entry>,
    collapsed: HashSet<String>,
    editor: Entity<Editor>,
    _subscription: Subscription,
}

impl Shell {
    pub fn new(
        vault: Vault,
        entries: Vec<Entry>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let editor = cx.new(|cx| Editor::new(vault, cx));
        let subscription = cx.observe(&editor, |_, _, cx| cx.notify());
        let first = entries
            .iter()
            .find(|e| e.name == "Welcome.htmd")
            .or_else(|| first_file(&entries));
        if let Some(first) = first {
            editor.update(cx, |editor, cx| editor.open(&first.path, window, cx));
        }
        Self {
            tree_focus: cx.focus_handle(),
            focused_path: first.map(|entry| entry.path.clone()).unwrap_or_default(),
            entries,
            collapsed: HashSet::new(),
            editor,
            _subscription: subscription,
        }
    }

    fn visible<'a>(&'a self, entries: &'a [Entry], out: &mut Vec<&'a Entry>) {
        for entry in entries {
            out.push(entry);
            if entry.directory && !self.collapsed.contains(&entry.path) {
                self.visible(&entry.children, out);
            }
        }
    }
    fn tree_key(&mut self, event: &KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        let mut rows = vec![];
        self.visible(&self.entries, &mut rows);
        if rows.is_empty() {
            return;
        }
        let index = rows
            .iter()
            .position(|entry| entry.path == self.focused_path)
            .unwrap_or(0);
        let next_path = rows.get(index + 1).map(|entry| entry.path.clone());
        let row = rows[index];
        let path = row.path.clone();
        let directory = row.directory;
        let key = event.keystroke.key.as_str();
        match key {
            "up" => self.focused_path = rows[index.saturating_sub(1)].path.clone(),
            "down" => self.focused_path = rows[(index + 1).min(rows.len() - 1)].path.clone(),
            "home" => self.focused_path = rows[0].path.clone(),
            "end" => self.focused_path = rows.last().unwrap().path.clone(),
            "right" if directory => {
                if !self.collapsed.remove(&path) {
                    if let Some(next) = next_path {
                        self.focused_path = next;
                    }
                }
            }
            "left" => {
                if directory && !self.collapsed.contains(&path) {
                    self.collapsed.insert(path);
                } else if let Some((parent, _)) = path.rsplit_once('/') {
                    self.focused_path = parent.into();
                }
            }
            "enter" | "space" => {
                if directory {
                    if !self.collapsed.remove(&path) {
                        self.collapsed.insert(path);
                    }
                } else {
                    self.editor
                        .update(cx, |editor, cx| editor.open(&path, window, cx));
                }
            }
            _ => return,
        }
        cx.notify();
        cx.stop_propagation();
    }

    fn tree(
        &self,
        entries: &[Entry],
        depth: usize,
        selected: Option<&str>,
        cx: &mut Context<Self>,
    ) -> Div {
        let mut tree = div().flex().flex_col();
        for entry in entries {
            let path = entry.path.clone();
            let directory = entry.directory;
            let collapsed = self.collapsed.contains(&path);
            let name = if directory {
                entry.name.clone()
            } else {
                entry
                    .name
                    .trim_end_matches(".htmd")
                    .trim_end_matches(".md")
                    .to_owned()
            };
            tree = tree.child(
                div()
                    .id(SharedString::from(path.clone()))
                    .flex()
                    .gap_2()
                    .items_center()
                    .mx_2()
                    .py_2()
                    .pl(px(12. + depth as f32 * 16.))
                    .pr_3()
                    .rounded_md()
                    .text_size(px(12.))
                    .cursor_pointer()
                    .bg(if selected == Some(&path) {
                        rgb(0x33303f)
                    } else {
                        rgb(0x202125)
                    })
                    .text_color(if selected == Some(&path) {
                        rgb(0xd8cbff)
                    } else {
                        rgb(0xb6b6bd)
                    })
                    .border_1()
                    .border_color(if self.focused_path == path {
                        rgb(0x6b587f)
                    } else {
                        rgb(0x202125)
                    })
                    .hover(|style| style.bg(rgb(0x292a30)))
                    .child(if directory {
                        if collapsed { "▸" } else { "▾" }
                    } else {
                        "▤"
                    })
                    .child(name)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.focused_path = path.clone();
                        if directory {
                            window.focus(&this.tree_focus, cx);
                            if !this.collapsed.remove(&path) {
                                this.collapsed.insert(path.clone());
                            }
                        } else {
                            this.editor
                                .update(cx, |editor, cx| editor.open(&path, window, cx));
                        }
                        cx.notify();
                    })),
            );
            if directory && !collapsed {
                tree = tree.child(self.tree(&entry.children, depth + 1, selected, cx));
            }
        }
        tree
    }
}

impl Render for Shell {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let selected = self
            .editor
            .read(cx)
            .note
            .as_ref()
            .map(|doc| doc.path.clone());
        div()
            .on_action(cx.listener(|this, _: &FocusFiles, window, cx| {
                window.focus(&this.tree_focus, cx);
                cx.notify();
            }))
            .flex()
            .size_full()
            .bg(rgb(0x191a1d))
            .text_color(rgb(0xdededc))
            .font_family(".AppleSystemUIFont")
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_6()
                    .w(px(52.))
                    .h_full()
                    .pt_5()
                    .bg(rgb(0x121316))
                    .border_r_1()
                    .border_color(rgb(0x292a2e))
                    .text_color(rgb(0xbba7ef))
                    .child(div().text_size(px(32.)).child("h"))
                    .child("▤")
                    .child("⌕"),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .w(px(252.))
                    .h_full()
                    .flex_shrink_0()
                    .bg(rgb(0x202125))
                    .border_r_1()
                    .border_color(rgb(0x2c2d32))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_3()
                            .p_5()
                            .h(px(88.))
                            .child(
                                div()
                                    .text_size(px(30.))
                                    .text_color(rgb(0xbaa6ed))
                                    .child("◇"),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(div().text_size(px(14.)).child("Hypertextual"))
                                    .child(
                                        div()
                                            .text_size(px(10.))
                                            .text_color(rgb(0x797c87))
                                            .child("LOCAL VAULT"),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .px_5()
                            .pb_3()
                            .text_size(px(10.))
                            .text_color(rgb(0x92939f))
                            .child("FILES"),
                    )
                    .child(
                        div()
                            .id("tree-scroll")
                            .track_focus(&self.tree_focus)
                            .on_key_down(cx.listener(Self::tree_key))
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .child(self.tree(&self.entries, 0, selected.as_deref(), cx)),
                    )
                    .child(
                        div()
                            .p_4()
                            .border_t_1()
                            .border_color(rgb(0x2b2c31))
                            .text_size(px(10.))
                            .text_color(rgb(0x9395a0))
                            .child("●  GPUI / Metal                         PoC"),
                    ),
            )
            .child(self.editor.clone())
    }
}

fn first_file(entries: &[Entry]) -> Option<&Entry> {
    for entry in entries {
        if !entry.directory {
            return Some(entry);
        }
        if let Some(file) = first_file(&entry.children) {
            return Some(file);
        }
    }
    None
}
