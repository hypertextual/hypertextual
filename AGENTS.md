# UI requirements

Use the published npm packages `@cloudvoyant/helical-svelte` and `@cloudvoyant/helical-ui` for application UI. This is a hard requirement. Use `~/Projects/helical-ui` as the reference for component composition and style; do not replace npm dependencies with local paths or copy existing Helical components. Use existing Helical components when available, including its Sidebar parts.

When Helical lacks a component, build a reusable Svelte wrapper around the corresponding Ark UI primitive in `libs/ui`, following the Helical component style. The `@hypertextual/ui` workspace library must remain private and non-publishable. Use Ark UI for component behavior, accessibility, keyboard navigation, and state; do not reimplement those behaviors with application-specific DOM handlers. The workspace file tree must use the local Ark UI Tree View wrapper inside the published Helical Sidebar. Keep filesystem and article logic in the app.

Keep browser checks focused on visible behavior, accessibility, and persistence. Run the applicable mise lint, build, and browser tasks before completing UI changes. Do not commit or publish unless requested.

Use the Lucide icon package used by Helical for application and tree icons. Keep folder icons in a fixed-size alignment box; use branch indentation guides instead of separate chevrons. New articles open directly in the editor; the first heading is the source of the article title and saved filename. Use inline tree naming for folders and explicit filename renames, not for initial article-title editing.

Persist uploaded images in `.images` beside their article with relative Markdown references. Runtime image URLs must never leak into Markdown. Recovery must work in the native Tauri app: use Helical/Ark alert dialogs or toasts for actionable errors, and never native browser confirm/alert dialogs or ad hoc error banners. The workspace chooser belongs in the top bar beside the app name and must show a short workspace name with an Add workspace placeholder until multi-workspace support is implemented. Leave the sidebar footer empty.

# Helical component conventions

Keep `libs/ui` generic and portable to Helical. Put application-specific compositions, messages, and flows in `apps/hypertextual-svelte/src/components`; the draft recovery dialog belongs there. Group related parts and their styles under one component directory, such as `context-menu/` or `tree-view/`. Export only the public components and types from the library entry point.

Follow `~/Projects/helical-ui/libs/helical-ui/src` and `libs/helical-svelte/src` when adding wrappers. Keep framework-neutral base class strings and `cva` variants in a colocated `styles.ts` module. Derive variant types with `VariantProps`, compose published Helical variants where available, and merge caller classes with the published `cn` utility. Use Tailwind utilities and Helical semantic theme tokens for colors, borders, focus, disabled, invalid, and Ark `data-*` states. Do not add component-specific global CSS selectors, hard-coded palette colors, or copied Helical implementations. Add or extend theme tokens when a component needs a new semantic value. Ensure the consuming app scans the library's source for utility classes.

Reuse published Helical editor contracts and node factories, and use upstream Tiptap types for editor documents. Keep portable document conversion behind the reusable editor wrapper in `libs/ui`; application services own workspace storage and autosave policy. Do not turn `htmd-ts` into a UI/editor package. The HTMD libraries remain reserved for format SDK design. Continue using npm dependencies; changes needed in Helical itself belong in a separate upstream change.

# Test organization

Keep end-to-end tests in TypeScript under root-level `e2e/`, outside Rust applications and their test/example directories. Use Playwright Test for the single `e2e/hypertextual-desktop` suite. Keep exactly two feature specs for now: `workspace-file-tree.spec.ts` and `editor.spec.ts`. Keep browser configuration, entry points, shared lifecycle fixtures, and the suite's Mise tasks alongside them; do not add a root `e2e/mise.toml` or duplicate app-local E2E runners. Rust tests cover unit and service behavior, not browser journeys.

Organize specs with native `test.describe('When …')` state groups and native `test` cases for individual observable behaviors. Cover empty and existing workspaces separately. Use suite/feature tags and mark representative journeys `@smoke`. Separate Arrange, Act, and Assert blocks with comments, repeating them when a longer journey needs another check. Keep assertions explicit; do not build a custom step runner or wrap entire test cases in helper aliases.

Use Playwright fixtures for per-test lifecycle and cleanup, without mutable module-level state. Each case owns a temporary workspace and browser context; cleanup must only remove run-owned files. Assert visible behavior, accessible controls, actual file contents and paths, and persistence after reopening. Drive editor changes through rendered controls and keyboard input, not internal editor commands. Keep fixture helpers separate from cases and export only helpers used by another module.

The current browser suite mounts the production Svelte application with a filesystem-backed substitute for Tauri IPC. Keep this boundary explicit: it checks browser UI and file persistence, not the native window runtime, Rust filesystem safety, or system Trash integration. Test those service guarantees with Rust unit tests. Never use the person's real workspace in automated tests.

Run checks through the suite's Mise tasks. Use `mise run //e2e/hypertextual-desktop:smoke` for quick checks, or pass a spec path, `--grep`, or `--project` to `:test` for narrower runs. During iteration, run only relevant cases and reuse passing evidence for unchanged code. Run the full suite for final validation or shared-fixture changes. Keep generated builds, browser traces, screenshots, and reports ignored. Do not commit or publish unless requested.

# Component organization

Declare named prop types before destructuring. Keep UI-library prop contracts in each component directory's `types.ts`. Keep Svelte scripts in this order when sections apply: Props, State, Derived, Lifecycle, Methods. Use `// Section ---` separators through column 80 and omit empty sections. Keep application components lean by placing workspace and editor view models in `src/services` and Tauri adapters in `src/clients`.

# Documentation

Use the installed Difflab software architecture template for system boundaries, responsibilities, control flow, and contracts. Use the UI component architecture template for each public UI component under `docs/architecture/ui`. Put developer commands and setup in `docs/development.md`; keep algorithms and source walkthroughs out of that guide.

Always use `~/.difflab/templates/pull-request-description.md` when drafting or updating PR descriptions. Fill Intent, Changes, Validation, Further Work, and References with actual changes and verified evidence. Do not leave a new PR description empty.
