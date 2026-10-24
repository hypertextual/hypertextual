# File tree

## Overview

The file tree presents workspace entries inside the shell sidebar. It connects workspace actions to the reusable TreeView.

## Design

### Layout

```text
Folder
| Article
| Nested folder
Other article
```

Folder icons change between open and closed states. Guides show nesting without separate chevrons.

### Behavior

- Default: Folders start collapsed and article labels use saved titles when available.
- Interaction: Select articles, rename entries inline, or open folder context menus.
- Loading, empty, and error: TreeView handles branch loading and retry. The shell handles an empty workspace.
- Accessibility: Ark owns focus, keyboard navigation, selection, and renaming.

## Implementation

### Public API

`FileTreeProps` contains one `WorkspaceService`. The component forwards the service view model to TreeView and supplies workspace icons.

```svelte
<FileTree {workspace} />
```

### State and Data Flow

The workspace service owns known entries, pending creation, title labels, and folder refresh requests. FileTree keeps no entry cache. Selection opens the editor through the workspace service.

### Styling and Responsiveness

Icons use a fixed alignment box. The published Helical Sidebar controls the available width. Long labels truncate within tree rows.

### Maintainer Notes

Keep article naming and filesystem behavior in the service. Test empty and existing workspaces, nested operations, collisions, and persistence through the browser suite.
