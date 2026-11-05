# UI library component architecture

These pages document the reusable components and hooks in `libs/ui` using the Difflab UI component architecture template. Internal parts share their parent component contract.

| Component                       | Responsibility                                           |
| ------------------------------- | -------------------------------------------------------- |
| [Tree view](tree-view.md)       | Reusable Ark tree behavior with `useKeyScope` navigation |
| [Context menu](context-menu.md) | Reusable compact action menu                             |
| [HTMD editor](htmd-editor.md)   | Svelte view wrapper for `htmd-ts`'s `HtmdEditor` plugin  |
| [Breadcrumb](breadcrumb.md)     | Current item path                                        |

`TreeNode`, `ContextMenuPositioner`, `useKeyScope`, and `svelte-node-view` are internal or supporting parts documented with their parent components. Application compositions are documented under [Svelte web app](../svelte-web-app/index.md).

[Editor source ownership](editor-source.md) records the local editor baseline, its split across `core-ts`, `htmd-ts`, and `libs/ui`, and the path for moving changes back into Helical.
