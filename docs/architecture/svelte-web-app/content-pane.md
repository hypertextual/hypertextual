# Content pane

## Overview

The content pane presents the selected document, image, or empty workspace preview. It shows the current article title and save status.

## Design

### Public API

`ContentPaneProps` is declared inside the component and contains a `WorkspaceService`. DocumentEditor receives the active document and reports serialized changes or typed failures.

```svelte
<ContentPane {workspace} />
```

### Layout

No selection:

```text
+------------------------------------------------------------------------+
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                 [document]                                             |
|                                                                        |
|                 Your workspace, ready to write.                        |
|                                                                        |
|          Select an article, or create a new one.                       |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
+------------------------------------------------------------------------+
|  No article selected                                      Local files  |
+------------------------------------------------------------------------+
```

Article selected:

```text
+------------------------------------------------------------------------+
|  A saved article                                                   MD  |
+------------------------------------------------------------------------+
|                                                                        |
|                                                                        |
|       A saved article                                                  |
|                                                                        |
|                                                                        |
|       Start writing your article here.                                 |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
|                                                                        |
+------------------------------------------------------------------------+
|  A saved article                                                Saved  |
+------------------------------------------------------------------------+
```

The selected article has a 40 px heading bar. Only the document body scrolls. Its reading area is centered, with a maximum width of 820 px and 48 px horizontal padding. Padding reduces to 24 px below a 700 px viewport width.

### State and Data Flow

```mermaid
stateDiagram-v2
    [*] --> NoSelection
    NoSelection --> Opening: select or create an article
    Opening --> Editing: supported article loads
    Opening --> ReadOnly: source cannot be edited safely
    Opening --> Image: image loads
    Opening --> Failed: file cannot open
    Failed --> Opening: Retry opening
    ReadOnly --> Opening: choose another entry
    Image --> Opening: choose another entry
    Editing --> Opening: save and choose another entry

    state Editing {
        [*] --> Saved
        Saved --> Pending: edit the article
        Pending --> Saving: autosave starts
        Saving --> Saved: write succeeds
        Saving --> Unsaved: write fails
        Pending --> Unsaved: edit cannot be saved as Markdown
        Saved --> Unsaved: edit cannot be saved as Markdown
        Unsaved --> Saving: retry a failed write
        Unsaved --> Pending: correct unsupported formatting
    }
```

- The heading and footer show the current article title. Hover either title to see its path.

## Implementation

- Key the editor by `editor.version`, not the selected path. Saving a new title can rename the file without replacing the editing session.
- Wait for `tick()` before forwarding a focus request to a newly mounted editor.
