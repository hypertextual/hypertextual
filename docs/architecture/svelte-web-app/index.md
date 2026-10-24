# Svelte web app component architecture

These pages document the application components in `apps/hypertextual-svelte`. They compose the [reusable UI library](../ui/index.md) and application services.

| Component                                         | Responsibility                         |
| ------------------------------------------------- | -------------------------------------- |
| [Shell](shell.md)                                 | Workspace layout and service lifetime  |
| [File tree](file-tree.md)                         | Workspace data and tree actions        |
| [Article pane](article-pane.md)                   | Selected document, preview, and status |
| [Draft recovery dialog](draft-recovery-dialog.md) | Recovery choices for an unsaved draft  |

`App.svelte` supplies the production workspace client to the shell.
