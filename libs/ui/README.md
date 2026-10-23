# Hypertextual UI

Private Svelte components that extend the published Helical UI packages. This package is consumed as source by Vite and must not be published.

Use existing `@cloudvoyant/helical-svelte` components first. For missing components, wrap Ark UI primitives and use Helical styles and theme tokens. The reference implementation is `~/Projects/helical-ui`; runtime dependencies come from npm.

`context-menu/` and `tree-view/` each keep their parts together with framework-neutral base classes and CVA variants in `styles.ts`. They compose published Helical variants through `cn` and use semantic theme utilities for Ark states. Application-specific flows such as draft recovery belong in the app components directory.

`TreeView` wraps Ark UI's Tree View with Helical sidebar menu styles. It accepts nodes with stable `value` identifiers, labels, optional descriptions and children, and a `branch` flag for folders (including empty folders). `loadChildren` supplies children on demand; Ark manages expansion, focus, keyboard navigation and loading. `getLabel` resolves live display titles, while `selected` and `onselect` keep selection controlled by the application. Filesystem operations stay in the app.

Run `mise run //libs/ui:lint` to check the components. Workspace browser tests in `e2e/hypertextual-desktop` cover navigation, loading and retry, empty folders, article titles, selection after failed saves, and file and folder creation and renaming conflicts.

Tree naming uses Ark's `canRename`, `startRenaming`, `onRenameComplete`, and `NodeRenameInput` for F2, Enter, Escape, selection and focus. Async filesystem failures retain the attempted name and focus for retry. Invalid fields show a subtle red border and an accessible inline error. Editing clears the error, Enter retries, and Escape restores the original name. `ContextMenu` wraps Ark Menu's context trigger and portal with compact Helical theme styles; its positioner sits above the sidebar. The app supplies menu actions and filesystem behavior.
