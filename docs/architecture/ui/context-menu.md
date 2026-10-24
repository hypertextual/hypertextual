# Context menu

## Overview

ContextMenu is a generic action menu built on Ark UI Menu. Workspace branches and articles supply its actions.

## Design

### Layout

```text
+-------------------------+
| Action         Shortcut |
| Destructive action      |
+-------------------------+
```

The compact menu opens beside the context trigger. A portal keeps it above the sidebar.

### Behavior

- Default: Stay closed until the context trigger activates.
- Interaction: Ark handles keyboard navigation, item selection, focus return, and dismissal.
- Loading, empty, and error: The caller supplies the current action list and handles action failures.
- Accessibility: Ark supplies menu roles and focus behavior. Visible labels identify actions.

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
