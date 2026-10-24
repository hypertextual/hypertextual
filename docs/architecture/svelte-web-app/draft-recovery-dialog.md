# Draft recovery dialog

## Overview

The recovery dialog presents choices after document conversion or saving fails. It is an application-specific composition of published Helical controls.

## Design

### Layout

Save failure:

```text
+----------------------------------------------------------------------------+
|                                                                            |
|  Changes need attention                                                    |
|                                                                            |
|  Disk unavailable.                                                         |
|  Your draft is retained.                                                   |
|  Discard replaces it with the last saved version.                          |
|                                                                            |
| Keep editing   Copy draft   Retry autosave   Discard draft and reload      |
|                                                                            |
+----------------------------------------------------------------------------+
```

Unsupported formatting:

```text
+----------------------------------------------------------------------------+
|                                                                            |
|  Changes need attention                                                    |
|                                                                            |
|  This formatting cannot be saved as Markdown.                              |
|  Your draft is retained.                                                   |
|  Discard replaces it with the last saved version.                          |
|                                                                            |
| Keep editing   Copy draft   Discard draft and reload                       |
|                                                                            |
+----------------------------------------------------------------------------+
```

The modal is centered above the workspace. Retry appears only for a save failure. Busy operations disable Retry and Discard while the draft remains visible behind the modal.

### Behavior

- Open when saving or document conversion fails, with the failure reason and an explanation that the draft is retained.
- Keep editing closes the dialog without losing the draft. Copy draft copies its current content.
- Retry autosave appears for save failures and attempts to preserve the draft again.
- Discard draft and reload replaces the draft with the saved file. Retry and Discard are disabled while an operation runs.
- Keep keyboard focus inside the open dialog. Escape closes it without discarding the draft.

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
