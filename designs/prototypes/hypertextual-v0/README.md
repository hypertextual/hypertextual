# Hypertextual v0 prototype

Open [index.html](index.html) in a browser.
The design uses a minimal Obsidian-style workspace for sustained writing and editing.
It uses Difflab's neutral slate and white palette with no purple accent.
Article tabs share the 36-pixel top window bar.
The dense file tree uses 24-pixel rows with filenames, extensions, and draft, research, and editorial folders.
The [app PRD](../../../prd/0001-hypertextual-app/README.md) defines the product requirements.

## Conventions and reference

This design follows `~/Projects/difflab/designs/prototypes/difflab-v0`.
The editable source is one HTML file with pinned CDN imports for Tailwind CSS 4.3.3, Preline UI 5.0.0, and DOMPurify 3.4.16.
A CDN supplies browser dependencies from the internet.
There are no vendored dependencies, package files, or build steps.
The HTML requires internet access.
The PNG snapshots work offline and measure 1120 × 640, like the Difflab snapshots.

The reference is `poc/tauri-vs-gpui` at commit `fe19cfdcfd6a3e898e8dc06a49a544cf314494a7`.
Its inline bar chart and article fixtures inform this design.
The design adds top-bar tabs, Enter activation, a command palette, and distinct command surfaces.
The command palette has a thin border and no dark focus outline or background blur.
The colon menu spans the whole window, including the area below the file tree.
It uses dense Kakoune-style columns with full command names and a compact input line.
Shorthand input matches implicitly: `w` matches `write` and `write-all`, and `wa` matches `write-all`.
Which-key uses a small floating pane at the bottom right that updates with the current incomplete key sequence.
It uses a dense single-column list with 24-pixel rows and short command labels.
The `/` menu floats beside the typing caret for block insertion.
The top-right Login button indicates future scope and displays a status message.
It does not start authentication.
The prototype remains on `feature/architecture`, based on `origin/main`.
It does not merge the PoC or select a framework.

## Interactive states

| State | Open directly | Snapshot |
| --- | --- | --- |
| Article workspace | [Editor](index.html#editor) | [editor.png](snapshots/editor.png) |
| Ordinary Markdown | [Markdown](index.html#reference) | [markdown.png](snapshots/markdown.png) |
| Selected chart | [Selected](index.html#graph-selected) | [graph-selected.png](snapshots/graph-selected.png) |
| Inline chart editor | [Chart editor](index.html#graph-edit) | [graph-edit.png](snapshots/graph-edit.png) |
| Command palette | [Palette](index.html#palette) | [palette.png](snapshots/palette.png) |
| Bottom colon menu | [Commands](index.html#command) | [command.png](snapshots/command.png) |
| Filtered colon commands | [Filtered commands](index.html#command-filtered) | [command-filtered.png](snapshots/command-filtered.png) |
| Visual mode | [Visual](index.html#visual) | [visual.png](snapshots/visual.png) |
| Insert mode | [Insert](index.html#insert) | [insert.png](snapshots/insert.png) |
| Space shortcut overlay | [Space shortcuts](index.html#whichkey) | [whichkey.png](snapshots/whichkey.png) |
| File command group | [Space f](index.html#whichkey-files) | [whichkey-files.png](snapshots/whichkey-files.png) |
| Inline block menu | [Slash menu](index.html#slash-menu) | [slash-menu.png](snapshots/slash-menu.png) |
| Filtered block menu | [Slash chart](index.html#slash-filtered) | [slash-filtered.png](snapshots/slash-filtered.png) |
| Inserted chart block | [Inserted block](index.html#block-inserted) | [block-inserted.png](snapshots/block-inserted.png) |
| Expanded Visual selection | [Expanded selection](index.html#visual-expanded) | [visual-expanded.png](snapshots/visual-expanded.png) |
| Editor settings | [Settings](index.html#settings) | [settings.png](snapshots/settings.png) |
| Dark theme preview | [Dark settings](index.html#settings-dark) | [settings-dark.png](snapshots/settings-dark.png) |
| Future plugin scope | [Plugins](index.html#settings-plugins) | [settings-plugins.png](snapshots/settings-plugins.png) |

## Try the interaction

1. Select an article in the tree or tab strip.
2. Focus the article title with Tab.
3. Press `j` or Down to reach the chart in Normal mode.
4. Press Enter to open its inline data editor.
5. Change a value, then select Apply with Tab and Enter.
6. Open the command palette with `Cmd/Ctrl+K`.
7. Type a command name, use Up/Down, and press Enter.
8. Press Escape to return to Normal mode.
9. Type `:` to open the bottom command menu.

The file tree supports Up/Down and `j/k`.
Left/Right collapses or expands folders, and Enter opens articles.
The tab strip supports Left/Right.
`Cmd/Ctrl+Shift+E` focuses the file tree.
`Cmd/Ctrl+Shift+]` and `Cmd/Ctrl+Shift+[` switch articles.

Within the article, `j/k` or Up/Down moves between text and the chart in Normal mode.
Normal mode shows a character-sized block cursor.
`h/l` or Left/Right moves that cursor within the focused text element.
`i` enables text entry with a thin `|` caret.
`v` enters Visual mode with a text selection.
`h/l`, Left/Right, and `w/b` expand or contract its active endpoint.
`j/k` and Up/Down extend it into neighboring text elements.
Escape returns to Normal mode.
The toolbar can disable modal editing.
In Insert mode, a colon remains literal text.
The chart editor supports Apply, Cancel, Escape, and invalid-data feedback.

In the modal editor, Space opens a which-key-style overlay in Normal or Visual mode.
The overlay shows the next keys and commands.
`Space f e` focuses the file tree, and `Space b n` switches to the next open article.
`Space /` opens the command palette, and `Space :` opens the colon menu.
Backspace returns from a group and Escape cancels the sequence.
An unbound key shows feedback without running a command.
Space remains literal text in Insert mode and text inputs.
The keyboard leader does not override ordinary button activation.

While typing, enter ` /` after a word or `/` at the start of a text element.
The block menu floats at the caret and keeps focus in the article.
Type `chart` to filter, then press Enter to insert a chart block.
Up/Down selects other block types.
Escape dismisses completion and preserves the typed text.
An inserted chart supports Enter to edit its title.
Slashes within words or code do not open the menu.
`Space /` continues to open the app command palette in Normal or Visual mode.

Open Settings with `Cmd/Ctrl+,`, `Space ,`, or the sidebar gear control.
The command palette also includes Settings.
Select Light, Dark, or System to preview the theme.
Select Standard or Helix modal editing, then apply the keymap.
Cancel or Escape restores the theme and closes the modal.
The Plugins tab lists planned extension areas.
Left/Right moves between the Editor and Plugins tabs.

## Scope

This is an interaction design, not a production Markdown editor.
Text uses browser editing, and Visual mode demonstrates expanding text selections across displayed text elements.
It does not implement the complete Helix keymap, rich-element selection semantics, or Markdown serialization.
Tab drafts and chart edits stay in memory until the page reloads.
The save command reports an in-memory save and never writes to disk.
The chart uses the PoC's two-series bar example with five labels and values from 0 to 10.
File creation is a temporary visual example.
File rename, movement, deletion, tab closing, persistence, and conflict handling remain product requirements.
Inserted block examples reset when switching articles or reloading the page.
The chart insertion example edits its title only.
Production insertion undo, serialization, and complete inline chart controls remain PRD requirements.
Applied settings stay in memory until the page reloads.
Plugins are future scope, with no runtime or installation behavior in the prototype.

## Snapshot capture

`capture.cjs` uses Playwright from an existing installation.
It needs no dependencies inside this design directory.
Set `PLAYWRIGHT_MODULE` to the installed Playwright module, then run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/@playwright/test node designs/prototypes/hypertextual-v0/capture.cjs
```

The script runs interaction checks and refreshes the eighteen snapshots from the HTML.
Refresh them after changing the design.

## Validation

Chromium interaction checks passed on 2026-10-11.
They cover chart editing, retained drafts, editing modes, command menus, tree navigation, and Space sequences.
They also cover focus restoration, literal spaces, top-bar tab placement, and 24-pixel file rows.
They also cover expanding selections, slash completion, empty results, dismissal, and block insertion.
Layout checks cover the floating which-key pane, the compact colon menu, and the palette without background blur.
Settings checks cover theme preview and cancellation, keymap application, and keyboard access to the Plugins tab.
Which-key checks require compact rows in a single column.
Colon checks cover full-window width, multiple completions, full command names, and shorthand matching.
All eighteen snapshots use fresh page state.
Local documentation links and snapshot dimensions also passed.
A production editor and assistive technology audit remain outside this design validation.
