# Article pane

## Overview

The article pane presents the selected document, image, or empty workspace preview. It shows the current article title and save status.

## Design

### Layout

```text
+-------------------------------------+
| Article title                Format |
|-------------------------------------|
| Editor, source, image, or empty view |
|-------------------------------------|
| Article title           Save status |
+-------------------------------------+
```

The document area scrolls within the pane. Hiding the sidebar gives this pane the remaining window width.

### Behavior

- Default: Show an article-selection placeholder.
- Interaction: Edit through DocumentEditor. Retry a failed open through the labeled action.
- Loading, empty, and error: Show opening progress, source fallback, or an opening error.
- Accessibility: Label the main region and source preview. Announce save status through a live status region.

## Implementation

### Public API

`ArticlePaneProps` contains a `WorkspaceService`. DocumentEditor receives the active document and reports serialized changes or typed failures.

```svelte
<ArticlePane {workspace} />
```

### State and Data Flow

EditorService owns the selected entry, document, loading state, and save queue. The pane owns only its editor handle. A focus request opens a newly created article for immediate editing.

### Styling and Responsiveness

The editor has a bounded reading width. Toolbars truncate long titles and expose the actual file path on hover.

### Maintainer Notes

Mount a new editor when the document session changes. Preserve the mounted editor during title-driven filename updates. Browser tests cover delayed reads, continued editing, title changes, and save status.
