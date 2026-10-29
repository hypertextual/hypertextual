# Repository Guidance

## Hard Rules

- Use the published npm packages `@cloudvoyant/helical-svelte` and `@cloudvoyant/helical-ui`.
- Develop the copied Svelte editor and framework-neutral core in `libs/ui/src/editor`. Record upstream provenance in [the editor source guide](docs/architecture/ui/editor-source.md).
- Reference `~/Projects/helical-ui` for composition and style. Do not copy unrelated components or replace npm dependencies with local paths.
- Prefer existing [Mise tasks](mise.toml). See [development commands](docs/development.md).
- Commit or publish only when requested.
- Fill every section of `~/.difflab/templates/pull-request-description.md` with actual changes and verified evidence.
- Keep this file to terse, imperative bullets in simple English, with at most 500 source lines.
- Merge duplicate rules, replace contradictory rules, and link to maintained docs for details.
- Mark inferred or uncertain rules `[Proposed]` unless the user explicitly requires them.

## Organization

### Repository layout

- Keep reusable UI in private, non-publishable `libs/ui`.
- Keep application compositions, messages, and recovery flows in `apps/hypertextual-svelte/src/components`.
- Keep application view models in `src/models`, stateful services in `src/services`, and Tauri adapters in `src/clients`.
- Group related Rust models in one domain module, including workspace nodes, workspace listings, and workspace data.
- Keep Hypertextual workspace, article, and media models and services in private `libs/hyped-fs`. Keep desktop Rust code limited to Tauri setup, commands, and lifecycle adapters.
- Make `libs/htmd-ts` own Markdown syntax, extensions, validation, and synchronous conversion to ProseMirror JSON. Keep `libs/htmd-rs` deferred under its original name.
- Make `hyped-fs` specific to Hypertextual workspaces. Move existing native models, file policy, revision checks, and persistence services together instead of adding a generic filesystem layer. Keep frontend autosave scheduling in the app.
- Put reusable UI docs under `docs/architecture/ui` and app component docs under `docs/architecture/svelte-web-app`.
- Keep setup and commands in [the development guide](docs/development.md). Omit algorithms and source walkthroughs there.

### File layout

- Group reusable component parts and styles in one component directory.
- Export only public UI components and types from the library entry point.
- Declare named prop types before destructuring.
- Declare app-only prop types inside their owning Svelte component.
- Keep UI-library prop contracts in the component directory's `types.ts`.
- Order Svelte script sections as Props, State, Derived, Lifecycle, and Methods.
- Use `// Section ---` dividers through column 80. Omit empty sections.

## Style

### Rust

- Document every model and field, including private fields, with brief `///` comments using the `simple-english` skill.
- Explain each field's meaning, path base, units, or constraints where relevant.
- Limit model methods to validation, factories, mapping, derived values, and in-memory business rules.
- Keep filesystem access and persistence out of models.
- Use the Hypertextual services in `hyped-fs` for workspace containment, article and image operations, revision checks, and save rechecks.
- Keep Tauri commands as transport adapters and serialize filesystem operations across services.

### Svelte and Helical

- Use existing Helical components, including its Sidebar parts.
- Wrap missing components around the corresponding Ark UI primitive in `libs/ui`.
- Use Ark for behavior, accessibility, keyboard navigation, and interaction state. Do not recreate these with app-specific DOM handlers.
- Put framework-neutral base classes and CVA variants in colocated `styles.ts` files.
- Derive variant types with `VariantProps` and merge caller classes with published Helical `cn`.
- Compose published Helical variants and use Tailwind utilities with semantic theme tokens.
- Use semantic tokens for colors, borders, focus, disabled, invalid, and Ark states. Extend tokens when needed.
- Avoid component-specific global CSS and hard-coded palette colors.
- Scan the library source for Tailwind utilities in the consuming app.
- Reuse local editor contracts and node definitions in `libs/ui/src/editor/core`, and upstream Tiptap document types. Pass extension dependencies through `.configure()`.
- Use `EditorOverlays` for insertion requests and shared surface positioning and scroll control. Keep its geometry helpers private; render controls in Svelte.
- Make the app editor service orchestrate filesystem access, `htmd-ts`, portable image references, drafts, and autosave.
- Use a workspace-aware media service for local and remote image get, upload, and batch-get operations. Keep URL substitution maps local to the transformation method and document the substitution in architecture implementation notes.
- Keep article transformations in an article or document view model under `models`, with instance methods.
- Colocate schema compatibility tests with the service that owns validation.
- Exchange native Tiptap `JSONContent` with the reusable editor. Keep Markdown conversion, source previews, and format SDK dependencies outside `libs/ui`.
- Prefer CommonMark and established GFM syntax. Add bespoke syntax only for editor features that those formats cannot represent.
- Disable all text alignment. Keep text color and highlights. Keep responsive image source sets in frontend presentation state.
- Keep HTMD node definitions in `nodes.ts` and mark definitions in `marks.ts`. Colocate `nodes.test.ts` and `marks.test.ts`, with nested BDD groups for each element and variant.
- Use Tiptap Markdown machinery internally in HTMD. Keep its public exchange boundary to opaque file contents, native ProseMirror JSON, and plain issue metadata. Keep engine instances and extension APIs out of that public contract.
- Keep HTMD types in `types.ts` and named, purpose-specific errors in `errors.ts`. Document exactly when each error occurs.
- Keep the HTMD core API in `lib.ts`. Split conversion and validation into small functions with explicit responsibilities.
- Recover Markdown parsing failures per node with editable raw-source wrappers carrying syntax kind and diagnostic details. Keep supported content editable and let editor renderers style or hide wrappers without dropping saved source.
- Require full save/reopen round trips for supported persisted nodes, marks, and attributes, including formatting on whitespace. Cover all supported elements in an editable demo fixture.
- Implement services as stateful classes.
- Register desktop close and quit handlers in the shell lifecycle.
- Keep pending-save flushing and overlapping-close guards in the editor service.
- [Proposed] Keep the current editor interaction state in one `editable` flag on `EditorService`. Defer a separate modal-editing state model until its own design ticket.
- [Proposed] Keep article scrolling and keyboard reactions in the reusable editor component. Keep the application content pane focused on composition.

### Workspace UI

- Render the local Ark Tree View wrapper inside the published Helical Sidebar.
- Use the Lucide icon package used by Helical for application and tree icons.
- Keep folder icons in fixed alignment boxes. Use nesting guides instead of separate chevrons.
- Open new articles directly in the editor.
- Derive article titles and saved filenames from the first heading.
- Use inline naming for folders and explicit filename renames, not initial article-title editing.
- Store uploaded images in `.images` beside their article, with relative Markdown references.
- Keep runtime image URLs out of saved Markdown.
- Use Helical or Ark alert dialogs and toasts for actionable errors. Avoid browser dialogs and ad hoc error banners.
- Put the workspace chooser beside the app name, with a short label and a disabled Add workspace placeholder.
- Leave the sidebar footer empty.

### Documentation

- Use the installed Difflab software architecture and UI component templates.
- Keep library READMEs thin and follow the root README structure. Put detailed architecture and API documentation under `docs`, using the relevant installed Difflab templates.
- Keep diagrams inline in Markdown. Do not add separate diagram sources or rendered assets.
- Draw aligned UI skeletons with spacing and proportions grounded in actual styles. Show separate states when useful.
- Show trees as indented text and context menus beside their clicked element.
- Put Public API and State and Data Flow under Design in every Svelte component doc.
- Explain component behavior with Mermaid state diagrams. Add bullets only when a diagram is insufficient.
- Keep Implementation to terse maintainer notes that parent architecture docs do not already cover.
- Omit Styling and Responsiveness and separate Maintainer Notes subsections.

## Testing

- Keep TypeScript end-to-end tests under root `e2e/`, outside Rust applications and their test directories.
- Use one Playwright suite at `e2e/hypertextual-desktop`, with `workspace-file-tree.spec.ts`, `editor.spec.ts`, and `modal-editing.spec.ts` as feature specs.
- Cover editor extension behavior in `editor.spec.ts`. Do not add tests in the extensions directory.
- Colocate browser configuration, entry points, fixtures, and Mise tasks with that suite.
- Do not add a root `e2e/mise.toml` or duplicate app-local browser runners.
- Use native `test.describe` groups and individual tests for observable behavior.
- [Proposed] Group modal-editing journeys by the user's starting view or edit state, then by the action, using native Given and When describe groups.
- Cover empty and existing workspaces separately, with suite and feature tags and representative `@smoke` journeys.
- Separate Arrange, Act, and Assert blocks with comments. Keep assertions explicit and avoid custom step runners or test aliases.
- Give each case its own temporary workspace and browser context through fixtures. Avoid mutable module state.
- Clean up only run-owned files. Never test against the person's real workspace.
- Assert visible behavior, accessible controls, file contents, paths, and persistence after reopening.
- Edit through rendered controls and keyboard input, never internal editor commands.
- Keep fixture helpers separate from cases and export only helpers used by another module.
- Keep the browser suite's filesystem-backed Tauri substitute explicit. It does not test native windows, Rust filesystem safety, or system Trash.
- Cover native filesystem guarantees with Rust service behavior tests against real temporary files.
- Move existing native service behavior tests with their owning `hyped-fs` services. Colocate private Rust unit tests in `#[cfg(test)] mod tests`.
- Colocate TypeScript integration and unit tests beside their source as `*.test.ts`. Do not use `.integration.test.ts` names or separate directories for these tests.
- Put integration tests first under `// integration ---` and unit tests last under `// unit ---`. Extend divider dashes through column 80 and omit empty sections.
- Keep public Rust package integration suites in `libs/hyped-fs/tests`. Exercise package APIs with real temporary files or the actual parser.
- Cover every supported HTMD node, mark, attribute, and variant with parsing and full round-trip integration examples; preserve raw-source error recovery. Organize examples by node and mark family. Show literal Markdown input, explicit expected JSON, and full write/reopen behavior.
- Keep package coverage in integration suites. Do not add package E2E runners or private-helper coverage workstreams.
- Use optional `given_*` modules, `when_*` operation modules, and `it_*` outcome tests with Given, When, and Then comments.
- Share fixture setup code, but create one fixture per test and let it own its temporary directory.
- Avoid tests of private helpers, shared mutable fixtures, and custom BDD runners.
- Run browser checks through [the suite's Mise tasks](e2e/hypertextual-desktop/mise.toml).
- Use `:smoke` or targeted `:test` arguments during iteration. Reuse passing evidence for unchanged code.
- Run the full browser suite for final validation or shared-fixture changes.
- Run applicable Mise lint, build, and browser tasks before completing UI changes.
- Ignore generated builds, traces, screenshots, and reports.
