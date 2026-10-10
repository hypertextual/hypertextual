mod benchmark;
mod editor;
mod rich;
mod shell;

use gpui_kit::{assets::Assets, *};
use htmd_vault::Vault;

fn main() -> anyhow::Result<()> {
    let vault = Vault::from_env()?;
    let tree = vault.tree()?;
    gpui_kit::application().with_assets(Assets).run(move |cx| {
        gpui_kit::init(cx);
        gpui_kit::component::Theme::change(gpui_kit::component::ThemeMode::Dark, None, cx);
        cx.bind_keys([
            KeyBinding::new("cmd-s", editor::Save, None),
            KeyBinding::new("cmd-shift-e", shell::FocusFiles, None),
        ]);
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1240.), px(840.)),
                    cx,
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Hypertextual · GPUI".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            cx,
            move |window, cx| cx.new(|cx| shell::Shell::new(vault, tree, window, cx)),
        )
        .expect("open window");
        cx.activate(true);
    });
    Ok(())
}
