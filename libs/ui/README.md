# Hypertextual UI

Private Svelte components that extend the published Helical UI packages. This package is consumed as source by Vite and must not be published.

Use existing `@cloudvoyant/helical-svelte` components first. For missing components, wrap Ark UI primitives and use Helical styles and theme tokens. The reference implementation is `~/Projects/helical-ui`; runtime dependencies come from npm.

`TreeView` wraps Ark UI's Tree View with Helical sidebar menu styles. It accepts nodes with stable `value` identifiers, labels, optional descriptions and children, and a `branch` flag for folders (including empty folders). `loadChildren` supplies children on demand; Ark manages expansion, focus, keyboard navigation and loading. `getLabel` resolves live display titles, while `selected` and `onselect` keep selection controlled by the application. Filesystem operations stay in the app.

Run `mise run //libs/ui:lint` to check the components. Workspace browser tests in `apps/hypertextual-svelte/e2e` cover navigation, loading and retry, empty folders, article titles, selection after failed saves, and file and folder creation.

Tree naming uses Ark's `canRename`, `startRenaming`, `onRenameComplete`, and `NodeRenameInput` for F2, Enter, Escape, selection and focus. Async filesystem failures retain the attempted name for retry. `ContextMenu` wraps Ark Menu's context trigger and portal with compact Helical theme styles; its positioner sits above the sidebar. The app supplies menu actions and filesystem behavior.
