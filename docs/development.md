# Development Guide

From clone to a running desktop app. This project uses [Premise](https://github.com/cloudvoyant/premise) for development tasks.

## 1. Clone + install

Install [Mise](https://mise.jdx.dev/getting-started.html), [Premise](https://github.com/cloudvoyant/premise#readme), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```sh
git clone https://github.com/hypertextual/hypertextual.git
cd hypertextual
```

If you are trying the unmerged scaffold, switch to its branch before installing dependencies:

```sh
git switch feature/scaffold
```

Install the workspace tools and dependencies:

```sh
mise trust
pm install
```

Bun installs shared frontend dependencies at the repository root. Premise also installs the declared tools and runs each Rust project's dependency-fetch task.

## 2. Local development

```sh
pm run hypertextual-desktop:dev
```

The desktop command starts Vite at `http://127.0.0.1:1420` and loads the Svelte app into the Tauri window. Hot module replacement applies Svelte edits without restarting Rust. Rust edits rebuild and restart the desktop process.

The Vite server requires port `1420`. If another process uses that port, stop that process before starting desktop development. The desktop command owns the frontend server, so do not start a second copy.

To work on the frontend in a browser, use:

```sh
pm run hypertextual-svelte:dev
```

The browser uses the same URL. Tauri APIs exist inside the desktop window only, so browser code needs separate handling for desktop operations.

## 3. CLI and libraries

```sh
pm run hypertextual:run
pm run htmd-rs:test
pm run htmd-ts:build
```

The CLI project is named `hypertextual`, while its binary is named `hyped`. It currently prints a starter greeting. The TypeScript library converts supported Markdown articles for the editor. The Rust library still contains starter behavior.

## 4. Builds

```sh
pm run hypertextual-desktop:build
pm run hypertextual-svelte:build
```

The desktop build compiles the Svelte app and embeds its `dist/` files. The desktop build task creates a debug executable without an installer. Bundled production apps need neither Bun, Node, nor a frontend development server at runtime.

Desktop tests and lint tasks build the frontend first because Tauri needs its assets during compilation. The Svelte app and TypeScript library share one dependency-install task to prevent concurrent Bun installs.

## 5. Checks

```sh
mise run --jobs 1 '//...:build'
mise run --jobs 1 '//...:test'
mise run --jobs 1 '//...:lint'
mise run --jobs 1 '//...:format:check'
```

These commands run one task at a time across the projects. To limit a check to one project, use `pm run <project>:<task>`, for example:

```sh
pm run hypertextual-svelte:lint
pm run hypertextual-desktop:test
```

## 6. Desktop distribution

Desktop installers contain the compiled frontend. The private Svelte package is not published to npm, and the HTMD libraries remain internal.

The macOS bundle uses ad-hoc signing, which seals the app without an Apple developer identity. Developer ID signing and notarization require separate credentials for trusted public distribution. See the [architecture guide](architecture/index.md#packaging-flow) for the component boundaries and packaging flow.

## 7. Local article workspace

The desktop app creates `~/.hypertextual/workspace` when you open it. The Workspace header has New article and New folder icon buttons. New articles open directly in the editor so their first heading can be edited. The heading drives the saved filename; both toolbars update after autosave. New folders start an inline name field in the tree: Enter creates the folder, and Escape cancels. Right-click a folder to create an article or folder inside it. Press F2 or choose Rename from the context menu to edit a filename or folder name inline. Move to Trash removes the selected entry through the system Trash. Existing entries are never overwritten. Explicit filename renaming does not change the heading; the next heading change synchronizes the filename again. Name collisions get a numeric suffix without overwriting other files. Use the title-bar sidebar toggle (or Cmd/Ctrl+B) to focus on editing. The sidebar starts with folders collapsed and uses compact Lucide open/closed folder icons and branch guides, without chevrons or empty-folder messages. Each launch starts without a selected article. Tabs and workspace selection are outside the current scope.

Select a file to open it in the helical editor. The sidebar loads saved article titles before selection and updates the label while you edit. The filename follows heading edits after autosave, while the editor stays mounted. The app saves edits after a short pause. It also saves pending edits before you switch articles, close the window, or quit. The status bar shows when the save completes. There is no Save button.

The app installs `@cloudvoyant/helical-svelte` and `@cloudvoyant/helical-ui` from npm. Both packages are pinned to `0.19.0`. The local `~/Projects/helical-ui` checkout is a reference for components. The app does not need that checkout to build or run. The published component exports also require the `manim-web` dependency.

The editor supports headings, paragraphs, bold and italic text, links, lists, task lists, quotes, notices, and code blocks. It supports these forms in `.md` and Markdown-compatible `.htmd` files. It shows other syntax as the original source without editing. Examples include HTML, tables, metadata at the start of an article, and rich HTMD blocks. A complete rich HTMD format remains future work.

Opening an article does not rewrite it. Unchanged content keeps its original bytes. Edited articles use standard Markdown formatting and keep their original line endings and byte-order mark. A byte-order mark is an optional marker at the start of a text file. If an editor feature cannot convert back to Markdown, the app retains the draft and shows an error.

A save uses a temporary file beside the article, then replaces the article after the write completes. The app retains the file permissions. If the file changes outside the app, autosave stops and retains the local draft. Use Copy draft before you discard it. Retry autosave after you resolve a write failure, or use Discard draft and reload to read the current file. The recovery dialog lets you keep editing or explicitly discard the draft.

The desktop limits editing to UTF-8 articles of 16 MB or less. It rejects paths and links outside the workspace. Folder expansion reads current entries from disk. Restart the app to refresh the root listing. The app does not watch for new files yet.

The desktop Playwright suite lives in `e2e/hypertextual-desktop`. It has two feature specs: `workspace-file-tree.spec.ts` covers empty and existing workspaces, article and folder creation, renaming, deletion, keyboard navigation, and the workspace controls. `editor.spec.ts` covers slash-menu access, supported block creation and editing, removal, autosave, image persistence, and draft recovery. Widget journeys run when creating an article and when updating an existing one. Dividers support insertion and removal; they have no editable content.

Install the browser engines once, then use the suite's Mise tasks:

```sh
mise run //e2e/hypertextual-desktop:install
mise run //e2e/hypertextual-desktop:list
mise run //e2e/hypertextual-desktop:smoke
mise run //e2e/hypertextual-desktop:test -- workspace-file-tree.spec.ts --project chromium
mise run //e2e/hypertextual-desktop:test -- editor.spec.ts --grep 'notice'
mise run //e2e/hypertextual-desktop:test
mise run //e2e/hypertextual-desktop:lint
```

Use focused runs during development and a full run for final validation or shared-fixture changes. Each case owns a temporary workspace and browser context. The suite builds the production Svelte UI with a filesystem-backed substitute for Tauri IPC. Assertions check the visible UI and files on disk, including reopening saved articles. These tests do not exercise the native Tauri window, Rust path safety, or system Trash integration; Rust unit tests cover the filesystem service. E2E test cases and runners do not live in Rust. Playwright is pinned to `1.58.2` so its WebKit engine also runs on macOS 14. Failure traces, screenshots, and HTML reports are generated under the suite and ignored by Git.

Notices save as Markdown quotes with an alert marker and a custom title. The marker names follow [GitHub’s alert syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts). Hypertextual adds the title after the marker. Other readers can display these blocks as quotes. Empty notices also save and reopen.

```markdown
> [!NOTE] Note Remember this.
```

The sidebar uses the published Helical Sidebar components. Its file tree uses the Ark UI Tree View wrapper in the private `libs/ui` library. UI requirements are recorded in `AGENTS.md`.

Uploaded PNG, JPEG, GIF, and WebP images are saved in `.images` beside their article. Markdown stores relative references; the editor resolves them locally when reopening. Image placeholders, alt text, and captions round-trip through the Markdown adapter. The asset directory is hidden from the tree. Progressive remote upload is tracked in [DIFF-230](https://linear.app/cloudvoyant/issue/DIFF-230/progressively-sync-article-local-image-assets-from-images-directories).

The workspace chooser sits beside the app name in the top bar. Add workspace is a disabled placeholder; the sidebar footer is empty. Draft and save problems use a Helical alert dialog with Keep editing, Copy draft, retry when applicable, and Discard draft and reload. Recovery does not depend on browser confirmation dialogs.
