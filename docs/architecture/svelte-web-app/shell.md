# Shell

## Overview

The shell is the desktop workspace frame. It composes navigation, file actions, the workspace explorer, the content pane, and draft recovery.

## Design

### Public API

`Shell` accepts a `WorkspaceClient`. `App` supplies the production Tauri client. Tests supply isolated Tauri behavior at the transport boundary.

```svelte
<Shell client={workspaceClient} />
```

### Layout

Sidebar expanded:

```text
+----------------------------------------------------------------------------------------------+
| [o o o] [=] [Local workspace v]                                                              |
+--------------------+-------------------------------------------------------------------------+
| Workspace [+] [+d] |                                                                         |
|                    |                                                                         |
| Drafts/            |       A saved article                                                   |
| | First article    |                                                                         |
| | Research/        |                                                                         |
| Archive/           |       Start writing your article here.                                  |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |                                                                         |
|                    |-------------------------------------------------------------------------|
|                    | Local workspace > Drafts > A saved article                    View Saved|
+--------------------+-------------------------------------------------------------------------+
```

Sidebar collapsed:

```text
+----------------------------------------------------------------------------------------------+
| [o o o] [=] [Local workspace v]                                                              |
+----------------------------------------------------------------------------------------------+
|                                                                                              |
|                 A saved article                                                              |
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
+----------------------------------------------------------------------------------------------+
| Local workspace > Drafts > A saved article                                         View Saved|
+----------------------------------------------------------------------------------------------+
```

The title bar contains the sidebar toggle and workspace selector. The macOS window buttons sit at the vertical center of the 36 px title bar. The sidebar occupies 236 px of the window, below the 36 px title bar. Its footer is empty. The content pane fills the remaining width, with its status bar at the bottom.

### State and Data Flow

```mermaid
stateDiagram-v2
    [*] --> Opening
    Opening --> Ready: workspace opens
    Opening --> Failed: workspace cannot open
    Failed --> Opening: Retry

    Ready --> Ready: New article opens the editor
    Ready --> Ready: New folder starts inline naming
    Ready --> Closing: close or quit requested
    Closing --> Ready: saving or native close fails
    Closing --> [*]: pending changes saved and native close succeeds
```

Sidebar visibility changes independently of the selected document:

```mermaid
stateDiagram-v2
    [*] --> Visible
    Visible --> Hidden: toggle sidebar
    Hidden --> Visible: toggle sidebar
```

## Implementation

- Notify Rust that the frontend is ready only after both close and quit listeners are registered.
- Release listeners that finish registering after unmount. Otherwise, a closed shell can leave handlers active.
