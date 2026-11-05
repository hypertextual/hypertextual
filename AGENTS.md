# Repository Guidance

## Hard Rules

- Use the published npm packages `@cloudvoyant/helical-svelte` and `@cloudvoyant/helical-ui`. Reference `~/Projects/helical-ui` for composition and style; never replace npm dependencies with local paths.
- Develop the Svelte editor and framework-neutral core in `libs/ui/src/editor`. Record upstream provenance in [the editor source guide](docs/architecture/ui/editor-source.md).
- Prefer existing [Mise tasks](mise.toml). See [development commands](docs/development.md).
- Commit or publish only when requested.
- Fill every section of `~/.difflab/templates/pull-request-description.md` with actual changes and verified evidence.
- Keep this file under 500 lines as a lightweight style and review guide. Omit feature-specific implementation restatements and link to maintained docs for architecture details.
- Mark inferred or uncertain rules `[Proposed]` unless the user explicitly requires them.

## Organization

### Repository layout

```text
hypertextual/
├── apps/
│   ├── hypertextual-cli/       # Rust CLI binary
│   ├── hypertextual-desktop/   # Tauri shell, commands, and lifecycle adapters
│   └── hypertextual-svelte/    # Svelte frontend
│       └── src/
│           ├── clients/        # Transport adapters (Tauri / browser substitute)
│           ├── components/     # UI orchestration, panes, dialogs, and fallbacks
│           ├── models/         # Stateful view models and document transforms
│           └── services/       # Stateful application services (workspace, editor, hotkeys, settings, media)
├── libs/
│   ├── htmd-ts/                # Markdown <-> ProseMirror JSON codec and validation
│   ├── htmd-rs/                # Deferred Rust Markdown codec
│   ├── hyped-fs/               # Rust workspace, article, and media domain models and services
│   └── ui/                     # Private reusable Svelte components and editor core
├── docs/                       # Architecture, UI component, and keybinding docs
└── e2e/
    └── hypertextual-desktop/   # Playwright end-to-end suite and fixtures
```

### File layout

- Group reusable component parts and colocated `styles.ts` and `types.ts` in one component directory.
- Export only public UI components and types from library entry points.
- Order Svelte `<script lang="ts">` sections with column-80 dividers and omit empty sections:

```ts
// Props ---------------------------------------------------------------------
interface ComponentProps {
  ...
}
let { ... }: ComponentProps = $props()

// State ---------------------------------------------------------------------
// Derived -------------------------------------------------------------------
// Lifecycle -----------------------------------------------------------------
// Methods -------------------------------------------------------------------
```

- Declare UI-library prop contracts in `types.ts` and app-only prop interfaces inside their owning `.svelte` file before destructuring `$props()`.
- Order TypeScript test files with column-80 section dividers (`// integration ---` then `// unit ---`), omitting empty sections.

## Style

### Rust

- Document every struct, enum, and field (including private fields) with brief `///` comments in plain English (meaning, path base, units, or constraints).
- Limit model methods in `models/` to validation, factories, mapping, derived values, and in-memory business rules. Keep filesystem I/O in `services/`.
- Serialize filesystem mutations across services and keep Tauri commands thin transport adapters.

### Svelte and Helical

- Compose published Helical components (`Sidebar`, `Select`, `Button`, `WhichKeyProvider`) and wrap missing primitives around Ark UI in `libs/ui`.
- Delegate behavior, accessibility, keyboard navigation, and interaction state to Ark UI and Helical controllers rather than custom DOM handlers.
- Define framework-neutral base classes and CVA variants in `styles.ts`, derive variant types with `VariantProps`, and merge caller classes with Helical `cn`.
- Use semantic theme tokens for colors, borders, focus, disabled, invalid, and Ark data-attribute states. Avoid component-specific global CSS and hard-coded palette colors.
- Keep `Shell.svelte` focused strictly on UI orchestration and lifecycle; place keyboard shortcuts, keymaps, and navigation commands in `HotkeyService`.
- Bind multi-statement event callbacks to named handler methods in `<script>` rather than inline template lambdas.
- Implement services in `src/services/` as stateful classes.
- Exchange native Tiptap `JSONContent` with `libs/ui`. Keep Markdown parsing, serialization, and format SDK dependencies inside `libs/htmd-ts`.
- Keep HTMD node definitions in `nodes.ts` and mark definitions in `marks.ts`. Do not add legacy format shims; keep parsing fault-tolerant by recovering unsupported or malformed fragments as editable `unparsedBlock` / `unparsedInline` wrappers.

### Documentation

- Use the installed Difflab software architecture and UI component templates.
- Keep diagrams inline in Markdown using Mermaid (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`) and aligned ASCII UI skeletons grounded in actual styles.
- Put `Public API` and `State and Data Flow` under `Design` in Svelte component docs, and model interactive behavior with `stateDiagram-v2`.
- Keep research and comparison docs to concise facts, links, and tables without filler prose.

## Testing

- Colocate TypeScript unit and integration tests beside their source as `*.test.ts`.
- Keep all HTMD block and inline node round-trip cases in `libs/htmd-ts/src/nodes.test.ts` and mark cases in `marks.test.ts`, grouped by element and variant. Reserve `lib.test.ts` for whole-document codec contracts and error recovery.
- Keep public Rust integration suites in `libs/hyped-fs/tests` using real temporary directories (`given_*` / `when_*` modules and `it_*` tests) and private unit tests in colocated `#[cfg(test)] mod tests`.
- Keep Playwright E2E tests in `e2e/hypertextual-desktop/` (`workspace-file-tree.spec.ts`, `editor.spec.ts`, `modal-editing.spec.ts`). Do not place tests inside `libs/ui/src/editor/core/extensions`.
- Give each test its own temporary workspace and browser context via fixtures, and interact only through rendered controls and keyboard input:

```ts
test('...', async ({ page }) => {
  // Arrange
  ...
  // Act
  ...
  // Assert
  ...
})
```

- Run checks through [Mise tasks](mise.toml) and [the E2E suite tasks](e2e/hypertextual-desktop/mise.toml) (`:smoke` or targeted `:test` during iteration, full suite when shared fixtures change).
