# Development

Hypertextual uses [Premise tasks](https://github.com/cloudvoyant/premise/blob/main/docs/user-guide.md) for project commands. Run these commands from the repository root after completing the [getting started instructions](../README.md#getting-started).

## Desktop and frontend

Start the desktop app:

```sh
pm run hypertextual-desktop:dev
```

This command starts Vite at `http://127.0.0.1:1420` and loads the Svelte frontend inside the Tauri window. Hot module replacement applies Svelte edits without restarting the Rust process. Rust edits trigger a rebuild and restart of the desktop process.

The development server requires port `1420`. If another process uses that port, stop that process before starting desktop development. Do not start a separate frontend server while the desktop development command owns the port.

To develop the frontend in a browser without the desktop app, use:

```sh
pm run hypertextual-svelte:dev
```

The browser uses the same development URL. Tauri APIs are available inside the desktop window only. Browser code needs separate handling for operations that use the desktop backend.

## Production builds

Build the desktop app:

```sh
pm run hypertextual-desktop:build
```

The desktop build compiles the Svelte frontend and embeds its `dist/` files. The generated app does not need Bun, Node, or a frontend development server at runtime. The build task produces a debug executable without an installer.

Desktop tests and lint tasks build the frontend first because Tauri needs its assets during compilation. The native desktop build also needs the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

The macOS bundle uses ad-hoc signing, which seals the app without an Apple developer identity. This is separate from Developer ID signing and notarization, which are still required for trusted public distribution through macOS Gatekeeper.

## CLI and libraries

The CLI project is `hypertextual`, and its executable is `hyped`. Run the CLI and the library tasks with:

```sh
pm run hypertextual:run
pm run htmd-rs:test
pm run htmd-ts:build
```

Bun installs shared dependencies at the workspace root. The Svelte app and TypeScript library depend on the same install task to prevent concurrent installs. Both libraries are internal, and the Svelte package is private.

## Checks

Run the configured checks across the projects:

```sh
mise run --jobs 1 '//...:build'
mise run --jobs 1 '//...:test'
mise run --jobs 1 '//...:lint'
mise run --jobs 1 '//...:format:check'
```

The single-job setting keeps the checks sequential. Each project also exposes its own tasks through `pm run <project>:<task>`.
