# UI component architecture

These pages use the Difflab UI component architecture template. Application components compose reusable UI and application services. Internal parts share their parent component contract.

| Component                                         | Responsibility                         |
| ------------------------------------------------- | -------------------------------------- |
| [Shell](shell.md)                                 | Workspace layout and service lifetime  |
| [File tree](file-tree.md)                         | Workspace data and tree actions        |
| [Article pane](article-pane.md)                   | Selected document, preview, and status |
| [Draft recovery dialog](draft-recovery-dialog.md) | Recovery choices for an unsaved draft  |
| [Tree view](tree-view.md)                         | Reusable Ark tree behavior             |
| [Context menu](context-menu.md)                   | Reusable compact action menu           |
| [Document editor](document-editor.md)             | Portable editor and document API       |

`App.svelte` supplies the production workspace client to the shell. `TreeNode` and `ContextMenuPositioner` are internal parts documented with their parent components.
