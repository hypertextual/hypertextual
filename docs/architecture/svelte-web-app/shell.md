# Shell

## Overview

The shell is the desktop workspace frame. It composes navigation, file actions, the article pane, and draft recovery.

## Design

### Layout

Sidebar expanded:

```text
+----------------------------------------------------------------------------------------------+
| [=]  hypertextual    [Local workspace v]                                                     |
+--------------------+-------------------------------------------------------------------------+
| Workspace [+] [+d] |  A saved article                                                    MD  |
|                    +-------------------------------------------------------------------------+
| Drafts/            |                                                                         |
| | First article    |                                                                         |
| | Research/        |       A saved article                                                   |
| Archive/           |                                                                         |
|                    |                                                                         |
|                    |       Start writing your article here.                                  |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    +-------------------------------------------------------------------------+
|                    |  A saved article                                                 Saved  |
+--------------------+-------------------------------------------------------------------------+
```

Sidebar collapsed:

```text
+----------------------------------------------------------------------------------------------+
| [=]  hypertextual    [Local workspace v]                                                     |
+----------------------------------------------------------------------------------------------+
|  A saved article                                                                         MD  |
+----------------------------------------------------------------------------------------------+
|                                                                                              |
|                                                                                              |
|                 A saved article                                                              |
|                                                                                              |
|                                                                                              |
|                 Start writing your article here.                                             |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
|                                                                                              |
+----------------------------------------------------------------------------------------------+
|  A saved article                                                                      Saved  |
+----------------------------------------------------------------------------------------------+
```

The sidebar occupies 236 px of the window, below the 36 px title bar. Its footer is empty. The article pane fills the remaining width, with its status bar at the bottom.

### Behavior

- Start at the local workspace with no article selected.
- Keep the workspace selector beside the app name. Add workspace is visible but unavailable.
- New article opens a document for immediate editing. New folder opens an inline name field in the sidebar.
- Toggle the sidebar to give the article more space without changing the selected document.
- Show workspace loading and an empty-workspace prompt. If opening fails, show the reason and a Retry action.

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
