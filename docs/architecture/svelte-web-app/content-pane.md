# Content pane

## Overview

The content pane presents the selected document, image, or empty workspace preview. It shows the current article title and save status.

## Design

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

### Behavior

- With no selection, show the writing placeholder and an invitation to choose or create an article.
- While opening a selection, show progress. Then show its editable document, image preview, or original read-only source.
- Keep the title in the heading and status bars synchronized with the article. Hovering the title reveals the file path.
- Show pending, saving, saved, or unsaved status as edits are preserved. Announce those changes to assistive technology.
- If opening fails, show the reason and a Retry opening action. Save failures leave the draft available for recovery.

## Implementation

### Public API

`ContentPaneProps` is declared inside the component and contains a `WorkspaceService`. DocumentEditor receives the active document and reports serialized changes or typed failures.

```svelte
<ContentPane {workspace} />
```

### State and Data Flow

EditorService owns the selected entry, document, loading state, and save queue. The pane owns only its editor handle. A focus request opens a newly created article for immediate editing.

### Styling and Responsiveness

The editor has a bounded reading width. Toolbars truncate long titles and expose the actual file path on hover.

### Maintainer Notes

Mount a new editor when the document session changes. Preserve the mounted editor during title-driven filename updates. Browser tests cover delayed reads, continued editing, title changes, and save status.
