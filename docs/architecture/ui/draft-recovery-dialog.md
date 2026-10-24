# Draft recovery dialog

## Overview

The recovery dialog presents choices after document conversion or saving fails. It is an application-specific composition of published Helical controls.

## Design

### Layout

```text
+-------------------------------------------------+
| Changes need attention                          |
| Failure reason and retained-draft explanation   |
| Keep editing | Copy | Retry | Discard and reload |
+-------------------------------------------------+
```

Retry appears for save failures. Unsupported formatting requires editing the draft or discarding it.

### Behavior

- Default: Stay closed until a failure needs attention.
- Interaction: Keep editing, copy the draft, retry saving, or reload the saved source.
- Loading, empty, and error: Disable conflicting actions while an operation runs. Announce clipboard results.
- Accessibility: Helical Dialog supplies alert-dialog semantics, focus management, and keyboard dismissal.

## Implementation

### Public API

`DraftRecoveryDialogProps` declares `open`, `message`, `copyStatus`, `busy`, and callbacks for close, copy, discard, and optional retry.

```svelte
<DraftRecoveryDialog {open} {message} onclose={keepEditing} oncopy={copyDraft} ondiscard={reload} />
```

### State and Data Flow

EditorService owns the draft and failure state. The dialog emits choices and never accesses files or editor JSON. Discard waits for any active write before reopening the file.

### Styling and Responsiveness

The dialog uses published Helical parts and sits above workspace menus. The host layout controls the available viewport.

### Maintainer Notes

Keep this composition in the application. Do not replace it with browser confirm dialogs. Browser tests cover retained drafts, retry, copying, and discard after external changes.
