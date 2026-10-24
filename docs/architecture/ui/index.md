# UI library component architecture

These pages document the reusable components in `libs/ui` using the Difflab UI component architecture template. Internal parts share their parent component contract.

| Component                             | Responsibility                   |
| ------------------------------------- | -------------------------------- |
| [Tree view](tree-view.md)             | Reusable Ark tree behavior       |
| [Context menu](context-menu.md)       | Reusable compact action menu     |
| [Document editor](document-editor.md) | Portable editor and document API |

`TreeNode` and `ContextMenuPositioner` are internal parts documented with their parent components. Application compositions are documented under [Svelte web app](../svelte-web-app/index.md).
