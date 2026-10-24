# Tree view

## Overview

TreeView is a reusable Ark UI tree wrapper with Helical styling. The workspace file tree is its current consumer.

## Design

### Layout

```text
Branch row
| Child row
| Rename field
| Inline validation message
```

Rows contain a fixed icon area and a truncated label. Branch guides show nesting.

### Behavior

- Default: Render supplied nodes with controlled selection and collapsed branches.
- Interaction: Ark handles navigation, expansion, F2, Enter, Escape, and type-ahead behavior.
- Loading, empty, and error: Load children on demand. Retain failed rename attempts with an invalid field and an accessible error.
- Accessibility: Ark supplies tree semantics. Rename errors connect to their fields through accessible descriptions.

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
