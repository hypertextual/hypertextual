---
base_commit: 'e22cd78cee30908ec766efc747496301f7b549ba'
---

# PoC: Tauri versus GPUI for Hypertextual

Branch `poc/tauri-vs-gpui`. This experiment is not a release. Freeze as a tag
when accepted; do not merge through the PoC workflow.

## Question and acceptance target

Can either framework provide an Obsidian-style vault and a continuous rich
Markdown editor that stays responsive? The editor must support keyboard movement,
selection across nodes, Enter, Backspace, undo, and saving without per-block
editing modes. Headings, emphasis, lists, quotes and code remain rich while
editing. A heading shows its Markdown marker in the reserved margin only while
the caret is in that heading, without moving its text. `/` opens a component menu.

For this experiment, **htmd is CommonMark plus GFM and typed custom fences**.
The first custom node is a versioned, data-only bar chart: `htmd:chart` fences
contain JSON with `version`, `type`, `title`, `labels` and named `series`.
[Chart.htmd](vault/Examples/Chart.htmd) includes a rendered chart and its exact
source syntax. Both editors support `/chart`, keyboard movement past the chart,
and editing JSON while the chart remains visible. Select the chart and press
⌘ Enter, or use Edit chart data. Invalid data shows an error and retains the
source; Apply validates before updating. Ordinary Markdown tools display the
fence as code. This is an experimental format with v1 bar charts only.
Regular `.md` files use the same editor and retain their extension. Both shells
open a folder tree rooted at the checked-in `vault/`, with one note at a time.
The Rust backend performs actual reads and atomic saves with conflict detection.

Other custom node types, nbmd notebook execution, dbmd spreadsheet/database behavior,
tabs, backlinks, synchronization, file watching, and creating/renaming files are
outside this experiment. The GPUI table is a styled text projection rather than
a spreadsheet or a full cell editor.

## Setup and commands

Developed on macOS 14.5 arm64, M1 Pro with 16 GB RAM, Rust 1.98.1, Node 26.10,
npm, Python 3 and mise. Native builds require the Xcode command-line tools and
macOS SDK. Dependency versions are locked in `Cargo.lock` and
`apps/web/package-lock.json`. Tauri uses v2; GPUI uses gpui-kit 0.7.1, following
the version family used in `../lgtm`'s `poc/gpui-rpc-sqlite` branch. Rust dev
builds optimize the app at level 1 and dependencies at level 3.

The web editor uses `Prose` and `Chart` directly from
`~/Projects/helical-ui/libs/helical-react/src/prose.tsx`. That checkout must have
its dependencies installed and its shared library built. Set
`HELICAL_UI=/absolute/path/to/helical-ui` to use another location. No changes are
made to that checkout. Tiptap supplies editing, and Helical supplies rich text
presentation, including the chart renderer.

```sh
mise trust
mise run setup
mise run build
mise run test
mise run run:tauri
# In another terminal:
mise run run:gpui
```

Both apps default to this repository's `vault/`, independent of working directory.
Use `HTMD_VAULT=/absolute/path/to/vault` to override it. Tests use temporary vaults.

| Task | What it runs |
| --- | --- |
| `setup` | npm ci and the Chromium/WebKit Playwright browser installers |
| `build` | TypeScript/Vite production build and all three Rust binaries |
| `test` | Rust vault tests, GPUI rich editor tests, and Chromium/WebKit tests through the real Rust backend |
| `run:tauri` | Native Tauri shell with the Vite dev server |
| `run:gpui` | Native GPUI shell |
| `fixtures` | Ignored 100/1,000/5,000-paragraph notes in `vault/Benchmarks/` |
| `bench` | Shared Rust parser/source-join benchmark in release mode |
| `build:release` | Optimized GPUI executable and production Tauri app package |
| `bench:sizes` | Stripped arm64 app sizes, ZIP downloads and web assets |
| `bench:desktop` | Three paired native release trials using temporary vaults |

Save with **⌘ S** or the Save button. Changing files saves the current draft
first. If the file changed on disk, the switch is blocked and the draft remains
in memory. There is no conflict-resolution dialog in this PoC.

The web file tree supports Up/Down, Left/Right and Enter. GPUI supports the same
keys; **⌘ ⇧ E** focuses its file tree. The rich editors support movement,
Shift-selection, document/line boundary movement, clipboard operations and undo.
The slash menus filter while typing; use Up/Down and Enter to choose, or Escape
to dismiss. GPUI also supports clicking a menu item.

## Implementations

**Tauri:** a single Tiptap/ProseMirror contenteditable document. Standard editor
transactions provide navigation, selection, splitting/merging and undo. There
are no per-block textareas, source panels or click-to-edit modes. A heading
marker is an absolutely positioned decoration that never enters the document.
Each file gets an isolated Marked instance. Guards avoid unnecessary task and
ordered-list parsing; the table start callback reads only the first two lines.
Long documents feed bounded groups of Rust-parsed top-level blocks into one
Marked lexer, retaining its shared reference-link map and inline queue. Lists,
fences and tables stay intact. The full document remains mounted so browser
selection can span off-screen nodes.

Untouched ProseMirror nodes retain their original Rust block source by persistent
node identity. Changed nodes serialize to Markdown. An unchanged document saves
its exact original bytes. When Rust and Tiptap disagree on top-level counts,
the edited document falls back to whole-document serialization. This is not a
lossless editor for every CommonMark construct: raw HTML, reference definitions
and unusual blank-line structure can normalize after edits.

**GPUI:** one custom native input surface with one caret and selection, not a
collection of independent block inputs. Pulldown-cmark creates a visible rich
text projection with offsets into the original Markdown. GPUI shapes headings
at different sizes and applies inline font/decorations. The same wrapped lines
supply painting, mouse hit testing, native UTF-16 input geometry and vertical
keyboard navigation. Heading markers occupy the reserved margin. Unchanged
line shapes are reused; cursor movement does not re-shape the document. Only
visible lines paint, but the shared document and selection include every line.

Up explicitly targets the previous visual line rather than the blank gap
between paragraphs. Source blank paragraphs are retained in the projection so
Enter has an editable destination. Trailing spaces remain visible, and source
start/end affinities preserve hidden emphasis delimiters when deleting text.
Undo/redo store source and selection snapshots. Native input implements the
GPUI EntityInputHandler interface, including composition ranges.

GPUI-kit supplies the window, theme, assets and platform input plumbing. Its
source editor does not supply this mixed-size rich Markdown layout, so the
native editor layer is custom. This is a material implementation cost compared
with using Tiptap. Native source projection also needs more format coverage
before production use: nested formatting, decoded entities, complex lists,
images, links and IME composition are not comprehensively validated. Code has
no syntax highlighting. Table cells are laid out as text with row backgrounds,
not as a resizable cell grid. There is no native accessibility audit yet.

## Modules

| Location | Responsibility |
| --- | --- |
| `crates/vault/src/document.rs` | Shared CommonMark/GFM block boundaries and exact source retention |
| `crates/vault/src/storage.rs` | Vault tree, safe paths, atomic saves and external-change checks |
| `crates/vault/src/main.rs` | stdio adapter used by browser tests |
| `apps/tauri/src/` | Tauri IPC commands around the shared vault |
| `apps/web/src/NoteEditor.tsx` | Continuous Tiptap editor, heading decorations and save serialization |
| `apps/web/src/SlashMenu.ts` | Caret-positioned rich component menu |
| `apps/web/src/markdownExtensions.ts`, `markdownLexer.ts` | Bounded Markdown tokenizer work for long notes |
| `apps/web/src/App.tsx`, `FileTree.tsx` | File/save lifecycle and keyboard file navigation |
| `apps/gpui/src/editor.rs`, `shell.rs` | Native file/save lifecycle and file tree |
| `apps/gpui/src/rich/projection.rs` | Rich visible text and Markdown byte-offset mapping |
| `apps/gpui/src/rich/layout.rs` | Shared wrapped text layout, painting, caret and selection |
| `apps/gpui/src/rich/navigation.rs`, `input.rs` | Keyboard/mouse movement and native input/IME geometry |
| `apps/gpui/src/rich/components.rs` | Native slash component commands |
| `apps/gpui/src/rich/tests.rs` | Headless native editor interaction regression checks |
| `apps/web/tests/editor.spec.ts` | Browser behavior checks and long-note measurements |
| `vault/` | Shared sample notes; benchmark notes are generated and ignored |
| `scripts/` | Fixture generation, Helical CSS wiring and macOS manual input driver |

## Release performance and product evaluation

The native release comparison, package sizes and evaluation of web/mobile,
HTMD/NBMD/DBMD and plugins are in [framework-evaluation.md](docs/framework-evaluation.md).
Raw measurements are retained under `artifacts/performance/`. Three trials per
framework ran on the same M1 Pro / macOS 14.5 machine, with identical temporary
100/1,000/5,000-paragraph notes. All six trials verified persisted typed input.

| Metric | Tauri / WebKit | GPUI |
| --- | ---: | ---: |
| Installed stripped arm64 app | 7.30 MiB | 17.89 MiB |
| ZIP download | 2.82 MiB | 6.91 MiB |
| Warm startup median | 462 ms | 329 ms |
| Open 1,000 paragraphs, median | 271 ms | 189 ms |
| Open 5,000 paragraphs, median | 1,137 ms | 778 ms |
| Typing p95, 1,000 paragraphs | 22.1 ms | 25.5 ms |
| Typing p95, 5,000 paragraphs | 25.8 ms | 32.2 ms |
| Settled footprint, 1,000 paragraphs | 190 MiB | 91 MiB |
| Settled footprint, 5,000 paragraphs | 356 MiB | 116 MiB |
| Typing CPU, 5,000 paragraphs | 24.8% | 16.5% |
| Switch edited long note to chart, median | 1,105 ms | 46 ms |

GPUI uses substantially less memory and opens/switches files faster in this
implementation. Both editors have responsive paced typing; these results do not
establish a universal GPUI typing advantage. The web editor's long-note
serialization/save path is a concrete optimization target. Typing is at the start
of a note with a 60 ms pause after each observed update; burst input, large paste,
IME and edits throughout the document remain separate acceptance workloads.
CPU 100% represents one occupied core. The two-second post-open pause includes
deferred work and is not a battery or long-term idle test.

![Native release comparison](artifacts/performance/comparison.png)

Packages exclude system frameworks, vaults, notebook runtimes and plugins.
The production web assets total 1.56 MiB, or 492 KiB gzipped. No GPUI WASM,
iOS or Android package was built, and no mobile performance result is implied.

```sh
mise run build:release
mise run bench:sizes
mise run bench:desktop
```

The desktop benchmark requires macOS and existing screen-capture/event-posting
access. It brings isolated release-app windows to the foreground and uses only
temporary fixture vaults. `HTMD_BENCH=1` enables a compositor-visible marker;
ordinary application runs have no marker. Timings include capture overhead and
are not hardware key-to-photon measurements. Tauri memory includes its WebKit
helpers. `bench:sizes` creates stripped, ad-hoc-signed comparison packages under
ignored `target/performance-bundles/`; it does not sign with a developer identity
or publish anything.

## Evidence and limits

The earlier per-block source forms and the later GPUI plain-source baseline
failed the editing requirement and were replaced. Their screenshots and timing
results are archived under `artifacts/previous-block-form/`; they are not valid
evidence for this editor or a Tauri-versus-GPUI decision.

`mise run build` passed. `mise run test` passed all 15 Rust checks (6 vault,
9 native editor) and all 22 browser checks (11 each in Chromium and WebKit). The
native regression checks cover Up/Down across paragraph gaps, Enter's blank
paragraph, typing spaces, deletion inside bold text, undo, document selection,
slash-menu visibility and insertion, custom chart projection, validated data
editing and chart undo. Browser checks cover rich styles, heading
markers without reflow, keyboard file navigation, split/merge/undo, cross-node
selection, saves, external conflicts, shortcuts, slash commands and reference
links across lexer chunk boundaries, chart rendering, chart insertion, invalid
data rejection and custom-node save/reopen. Both native run tasks have been launched.

Current browser measurements are in `artifacts/continuous-chromium.json` and
`artifacts/continuous-webkit.json`. They use headless Vite dev builds and the real
Rust parser/filesystem through a stdio IPC adapter. Opening includes test and
transport overhead. Typing measures `beforeinput` to the next animation-frame
callback, which precedes presentation; it is not hardware key-to-photon latency.
These are not measurements of the native Tauri WebView or GPUI Metal window.

| Browser | Paragraphs | Observed open | Typing to rAF p95 |
| --- | --- | --- | --- |
| Chromium | 100 | 78 ms | 15.0 ms |
| Chromium | 1,000 | 153 ms | 13.9 ms |
| Chromium | 5,000 | 583 ms | 11.5 ms |
| Webkit | 100 | 136 ms | 15.0 ms |
| Webkit | 1,000 | 515 ms | 18.0 ms |
| Webkit | 5,000 | 3,571 ms | 457.0 ms |

WebKit's initial whole-document Markdown parse exceeded 30 seconds at 5,000
paragraphs. Bounded lexer input fixes that stall, but the 5,000-paragraph WebKit
editing measurement remains much slower than Chromium. Functional long-note
navigation passing does **not** establish that the snappy-editing target is met.
See the JSON artifacts for the latest timings rather than archived form-editor
numbers. The shared parser benchmark in `artifacts/parser-benchmark.txt` is still
valid, but parser throughput alone cannot select a UI framework.

The native GPUI window has been inspected with rich headings, bold/italic,
lists, quotes, code and styled table rows. Its open footer times only vault read
and projection construction, not the first frame. The native input driver targets
only the PoC's own window and requires existing macOS Accessibility/event posting
permission; it does not request or alter those permissions. The release comparison
now measures externally observed input latency,
file switching and process memory for both native apps. See
[the framework evaluation](docs/framework-evaluation.md) and
`artifacts/performance/desktop-summary.json`. Platform coverage remains macOS.

Vite reports a large-chunk warning for the production web bundle. Rust reports
an upstream future compatibility warning for `block` 0.1.6. Neither is treated as a measured UI
performance result.

## Decision and next steps

**Use the web UI with Tauri and a shared Rust core for the broader product.**
GPUI is feasible and has a clear native memory/file-switch advantage, but the
web stack offers the lower-effort path for the required editor, diverse rich
components, notebooks, databases and downloadable UI plugins.

| Product area | Assessment |
| --- | --- |
| HTMD rich editing and custom nodes | Web UI reuses Tiptap, Helical and React components; GPUI owns a custom rich editor and native renderers. |
| NBMD notebooks | Web UI has an easier path for code editors and varied rich outputs. Kernel execution and dependency management need a separate service in either stack. |
| DBMD tables/databases | Web UI has a broader grid ecosystem. GPUI-kit supplies tables, but spreadsheet selection, formulas, paste/fill and database semantics still need implementation. |
| Browser/mobile distribution | Shared web frontend with Tauri desktop/iOS/Android packaging is the lower-risk route. Browser storage and mobile vault/input adaptations remain work. |
| Downloadable UI plugins | JS/TS commands, panels, slash items and node renderers fit the web editor naturally. GPUI needs an additional runtime and host rendering contract. |
| Restricted compute plugins | A versioned WASM host API is an option for either stack. |

GPUI-kit's web guide describes primarily component-showcase use and unvalidated
full application distribution; its mobile integration is experimental. See the
linked primary sources in [the evaluation](docs/framework-evaluation.md).
Neither target was validated in this PoC. Paragraph measurements also do not
establish notebook execution or large spreadsheet/database performance.

Keep HTMD/NBMD/DBMD schemas independent of either renderer. Start a versioned
plugin SDK with commands, panels, slash items and node renderers, explicit
capabilities and lossless fallback for unknown nodes. Tauri's native plugin
mechanism is not an Obsidian-style runtime plugin loader; plugins in the same
WebView do not gain separate isolation. Separate trusted UI registrations from
restricted computation/execution APIs.

Next, improve incremental web serialization/save, preserve the faster/burst
headless WebKit workload as a regression check, and validate Markdown fidelity,
IME, accessibility and physical mobile devices. Then measure actual NBMD and
DBMD workloads before making performance claims for those formats. Neither
prototype is production-ready.

Difflab scaffolding worked during setup, but this checkout has no repository
project configuration. That did not block these local builds or runs; no
unrelated Difflab project was attached.
