# Repository Guidance

## Hard Rules

- Use the published npm packages `@cloudvoyant/helical-svelte` and `@cloudvoyant/helical-ui`. Reference `~/Projects/helical-ui` for composition and style; never replace npm dependencies with local paths.
- Define engine-neutral editor and keyscope contracts in `libs/core-ts`, develop the HTMD editor core and extensions in `libs/htmd-ts/src/editor`, and keep Svelte editor presentation (`HtmdEditor.svelte` and NodeViews) in `libs/ui/src/editor`. Record upstream provenance in [the editor source guide](docs/architecture/ui/editor-source.md).
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
│   ├── core-ts/                # Engine- and framework-neutral editor and keyscope contracts
│   ├── htmd-ts/                # Markdown <-> HTMD JSON codec, validation, and HtmdEditor core
│   ├── htmd-rs/                # Deferred Rust Markdown codec
│   ├── hyped-fs/               # Rust workspace, article, and media domain models and services
│   └── ui/                     # Private reusable Svelte components and HtmdEditor wrapper
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
- Order HTMD editor extension files in `libs/htmd-ts/src/editor/extensions` with column-80 section dividers (`// types ---`, `// api ---`, `// pm ---`, `// helpers ---`), omitting empty sections.
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
- [Proposed] Group component style exports in `styles.ts` into a component-scoped object.
- Use semantic theme tokens for colors, borders, focus, disabled, invalid, and Ark data-attribute states. Avoid component-specific global CSS and hard-coded palette colors.
- [Proposed] Style keyboard focus rings at the theme level rather than adding per-instance focus utility classes on controls.
- Prefer compound subcomponents over named snippet props for multi-part Svelte components.
- Keep `Shell.svelte` focused strictly on UI orchestration (`TitleBar`, `Sidebar`, `ContentPane`, `StatusBar`, and lifecycle); place keyboard shortcuts, keymaps, and navigation commands in `HotkeyService`, and register scoped widget, extension, and editor keymaps through `WhichKeyController.registerKeymap` (`useKeymap` in Svelte components).
- Keep theme state and toggle controls (`ThemeService`, `ThemeToggle`) in `libs/ui`, with `SettingsService` only syncing persisted preferences when needed.
- Bind multi-statement event callbacks to named handler methods in `<script>` rather than inline template lambdas.
- Implement services in `src/services/` as stateful classes.
- Delegate format recognition (`formats`, `supportsFile`) and document deserialization/serialization (`EditorFormatAdapter`, `EditorDocument`) to editor plugins (`HtmdEditor` in `libs/htmd-ts`) via `libs/core-ts` contracts; keep all Tiptap/ProseMirror, Markdown parsing, serialization, and AST dependencies internal to `libs/htmd-ts` without leaking `@tiptap/*` types or format regexes into `libs/ui` or `apps/hypertextual-svelte`.
- Keep HTMD node and mark schemas (`group`, `content`, `inline`, `atom`, `addAttributes`, `parseHTML`, `renderHTML`, `parseMarkdown`, `renderMarkdown`) in `nodes.ts` and `marks.ts`, and author interactive editor extensions in `libs/htmd-ts/src/editor/extensions` via `defineHtmdExtension` (`keymap`, `commands`, `nodeView`, and `// pm ---` ProseMirror plugins). Do not add legacy format shims; keep parsing fault-tolerant by recovering unsupported or malformed fragments as editable `UnparsableBlockFallback` / `UnparsableInlineFallback` (`unparsedBlock` / `unparsedInline`) wrappers.
- Prefer built-in Tiptap extension capabilities over custom implementations when supported.
- Document every exported TypeScript function with a JSDoc comment, and document every HTMD editor extension with a JSDoc comment that explains its editor usage and includes a brief ASCII visual example of its expected behavior.
- Extract extension keymap handlers into named helper functions (`handleTab`, `handleShiftTab`, `handleArrowUp`, `handleArrowDown`, `handleEnter`) under `// helpers ---`.
- Decompose modal editing in `libs/htmd-ts/src/editor/extensions` into dedicated mode (`NormalMode`, `SelectMode`, `InsertMode`) and preset (`Helix`, `Vim`, `Kakoune`) extensions composed by a parent `ModalEditing` extension.
- Favor composition and separation of concerns across UI primitives, editor NodeViews, and HTMD extensions.
- [Proposed] Name HTMD extensions after their node or behavior without superfluous suffixes like `Custom`.
- [Proposed] Keep node-level keyboard shortcuts, navigation specs, and control-focus handlers inside their owning HTMD extensions in `libs/htmd-ts/src/editor/extensions` rather than splitting them across `define-htmd-extension.ts`, `HtmdEditor`, or Svelte NodeViews.
- [Proposed] Encapsulate extension option wiring inside each HTMD extension and `buildExtensions` so `HtmdEditor` stays a thin host façade over Tiptap.
- [Proposed] Use Lucide icons in Svelte NodeViews rather than custom inline SVG paths in HTMD extension HTML renderers.
- [Proposed] Decompose multi-step Svelte lifecycle hooks (`onMount`, `$effect`) into named helper methods under `// Methods ---` rather than inline promise chains.
- [Proposed] Keep shell and layout state (such as sidebar and command surface open state) on `WorkspaceService` rather than `HotkeyService`.
- [Proposed] Use a single generic persistence helper in `SettingsService` rather than per-setting read and write functions.

### Documentation

- Use the installed Difflab software architecture and UI component templates.
- Write documentation in short, plain English without filler prose or restating style-guide rules.
- Keep diagrams inline in Markdown using Mermaid (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`) and aligned ASCII UI skeletons grounded in actual styles.
- Put `Public API` and `State and Data Flow` under `Design` in Svelte component docs, and model interactive behavior with `stateDiagram-v2`.
- Keep research and comparison docs to concise facts, links, and tables without filler prose.

## Testing

- Prefer E2E tests unless integration and unit tests add value or reduce testing burden.
- Cover all modal editing modes in BDD suites for all editor blocks.
- Structure BDD `Given` / `When` / `it` clauses as a logical hierarchy that reflects the component or application behavior tree, narrowing down paths so branch coverage is clear.
- [Proposed] Keep each BDD leaf test focused on a single behavior or transition and hoist shared setup into the enclosing `Given` scope (`beforeEach` / `beforeAll`).
- Colocate TypeScript unit and integration tests beside their source as `*.test.ts`.
- Prefer Playwright E2E tests with real DOM, persistence checks, and env-gated screenshot outputs (`E2E_SCREENSHOTS=1` into gitignored `test-results/`) over hand-rolled `window`/`document`/`localStorage` mocks in service tests; never check E2E screenshots into git.
- [Proposed] Do not duplicate upstream `@cloudvoyant/helical-ui` component behavior tests in Hypertextual E2E suites; restrict app E2E tests to Hypertextual integration, persistence, and side effects.
- Keep all HTMD block and inline node round-trip cases in `libs/htmd-ts/src/nodes.test.ts` and mark cases in `marks.test.ts`, grouped by element and variant. Reserve `lib.test.ts` for whole-document codec contracts and error recovery.
- Keep public Rust integration suites in `libs/hyped-fs/tests` using real temporary directories (`given_*` / `when_*` modules and `it_*` tests) and private unit tests in colocated `#[cfg(test)] mod tests`.
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
