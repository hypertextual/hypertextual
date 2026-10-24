# Tree view

## Overview

TreeView is a reusable Ark UI tree wrapper with Helical styling. The workspace file tree is its current consumer.

## Design

### Layout

Expanded and collapsed branches:

```text
Drafts/
|-- First article
`-- Research/
    `-- Source notes
Archive/
```

Conflicting inline rename:

```text
Drafts/
|-- First article
`-- [ Existing name          ]
    A file or folder with this
    name already exists.
Archive/
```

Rows are 24 px tall. Each nesting level adds 16 px of indentation, with a 14 px icon box and a truncated label. During renaming, a 22 px input replaces the label. Its error appears below that row.

### Behavior

- Show the supplied hierarchy with folders collapsed at first.
- Expand or collapse a branch to reveal or hide its children. Select a leaf to choose that item.
- If a branch cannot open, show an error and allow another expansion attempt to retry.
- Press F2 to rename the focused item. Enter submits the name, and Escape cancels.
- A failed rename retains the attempted name in an invalid field with an error below it. Typing clears the error so the name can be corrected.
- Use arrow keys to move through the tree. Keyboard focus remains visible as selection and expansion change.

## Implementation

### Public API

`TreeViewProps` in `libs/ui/src/tree-view/types.ts` defines nodes, selection, loading, renaming, label/icon rendering, context actions, and refresh requests. Stable node values identify entries. Callers keep storage behavior outside the component.

```svelte
<TreeView {nodes} {selected} onselect={selectNode} {loadChildren} />
```

### State and Data Flow

The caller owns selected values and creation requests. Ark owns interaction state. The wrapper retains loaded children and operation errors. `TreeNode` renders recursive parts under the same contract.

### Styling and Responsiveness

`styles.ts` composes published Helical Sidebar and Input variants. Semantic theme tokens control selection, focus, guides, and invalid fields.

### Maintainer Notes

Do not turn a failed selection flush into a different visible selection. Preserve attempted names until correction or cancellation. Workspace browser journeys cover these interactions with real temporary files.
