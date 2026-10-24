# File tree

## Overview

The file tree presents workspace entries inside the shell sidebar. It connects workspace actions to the reusable TreeView.

## Design

### Layout

Folders collapsed:

```text
Drafts/
Archive/
Welcome
```

Drafts expanded:

```text
Drafts/
|-- First article
`-- Research/
Archive/
Welcome
```

Creating a folder inside Drafts:

```text
Drafts/
|-- [ New folder             ]
|-- First article
`-- Research/
Archive/
Welcome
```

The tree fills the sidebar width below the Workspace actions. Folder icons occupy a fixed box and change with expansion. Article labels use their headings, while pending folders show an inline input.

### Behavior

- Start with folders collapsed. Expanding a folder reveals its entries and nesting guides.
- Select an article to open it. Its label follows the article heading as the user edits it.
- Create a folder with its name immediately editable. Create an article directly in the editor.
- Right-click a folder to create entries inside it. Right-click an entry or press F2 to rename it.
- If a name conflicts, retain the attempted name and show an inline error. Escape cancels the rename.
- Move to Trash removes the entry after the operation succeeds. A failed operation leaves the entry available.

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
