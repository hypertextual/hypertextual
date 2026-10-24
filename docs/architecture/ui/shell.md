# Shell

## Overview

The shell is the desktop workspace frame. It composes navigation, file actions, the article pane, and draft recovery.

## Design

### Layout

```text
+--------------------------------------------------+
| Sidebar toggle  hypertextual  Workspace selector  |
|--------------------------------------------------|
| Workspace   New article / folder | Article pane   |
| File tree                       |                |
|                                 | Status         |
+--------------------------------------------------+
```

The sidebar can collapse to leave the editor visible. The sidebar footer stays empty.

### Behavior

- Default: Open the local workspace without selecting an article.
- Interaction: Create files or folders, choose entries, or toggle the sidebar.
- Loading, empty, and error: Show workspace progress, an empty state, or a retry action.
- Accessibility: Published Helical controls supply labeled actions and sidebar keyboard behavior.

## Implementation

### Public API

`Shell` accepts a `WorkspaceClient`. `App` supplies the production Tauri client. Tests supply isolated Tauri behavior at the transport boundary.

```svelte
<Shell client={workspaceClient} />
```

### State and Data Flow

One `WorkspaceService` owns one `EditorService`. The shell starts workspace loading and attaches desktop close and quit handlers. Unmounting releases handlers and services.

### Styling and Responsiveness

The shell uses published Helical Sidebar and Select parts. The title bar contains the short workspace label. Add workspace remains a disabled placeholder.

### Maintainer Notes

Keep filesystem operations and document conversion out of this component. Browser tests cover the visible frame and sidebar toggle. Native close behavior uses the desktop integration boundary.
