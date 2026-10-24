# Context menu

## Overview

ContextMenu is a generic action menu built on Ark UI Menu. Workspace branches and articles supply its actions.

## Design

### Layout

Open menu over the sidebar and adjacent article area:

```text
+--------------------------------------------------------------------------+
| Workspace       [+] [+d]   |  A saved article                            |
|                            |                                             |
| Drafts/  x                 |                                             |
|          +-------------------+                                           |
| | First a| New article       |    A saved article                        |
|          | New folder        |                                           |
| | Researc| Rename         F2 |                                           |
|          | Move to Trash     |    Start writing here.                    |
| Archive/ +-------------------+                                           |
|                            |                                             |
|                            |                                             |
|                            |                                             |
|                            |                                             |
|                            |                                             |
|                            |                                             |
+--------------------------------------------------------------------------+
```

`x` marks the right-click position on the Drafts row. The menu opens below that point and overlays both the tree and the adjacent pane. It has a minimum width of 164 px, with 25 px compact rows. Shortcut labels align at the right edge.

### Behavior

- Right-click an item to open its actions at the cursor position.
- Choose an action to run it and close the menu.
- Use the arrow keys to move between actions and Enter to choose one.
- Press Escape or click outside to close the menu without choosing an action.

## Implementation

### Public API

`ContextMenuProps` declares `items`, `onaction`, a trigger snippet, size, and caller classes. `ContextMenuItem` contains a value, label, optional shortcut, and destructive flag.

```svelte
<ContextMenu items={actions} onaction={runAction}>
  {#snippet children(_props)}<span>Open actions here</span>{/snippet}
</ContextMenu>
```

### State and Data Flow

Ark owns menu state. The wrapper emits the selected action value. `ContextMenuPositioner` refreshes portal positioning after opening and contains no application state.

### Styling and Responsiveness

Shared CVA variants and semantic tokens provide compact items, highlighted states, and destructive colors. The positioner stays above the sidebar layer.

### Maintainer Notes

Keep menu parts together under `context-menu/`. The planned upstream component is tracked in [CLO-198](https://linear.app/cloudvoyant/issue/CLO-198/add-a-generic-ark-ui-context-menu-using-the-hypertextual). Browser tests cover folder actions and inline rename entry from the menu.
