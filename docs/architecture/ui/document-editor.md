# Document editor

## Overview

DocumentEditor wraps the published Helical editor with a portable document API. Hosts exchange source text and title metadata without traversing editor JSON.

## Design

### Public API

`EditorDocument.open(source, assets?)` prepares a document. The session exposes title, editability, source, serialization, and draft-copy operations. `DocumentEditorProps` accepts the session, editability, and change/error callbacks. The component handle exposes `focus()`.

`EditorAssets` supplies `resolve(source)` and `upload(file)`. Upload results include a persisted source reference and a display URL. The host decides how storage works.

```svelte
<DocumentEditor document={session} onchange={saveChange} onerror={showRecovery} />
```

### Component Diagram

```mermaid
flowchart TD
    host["Host component"]
    wrapper["DocumentEditor"]
    editor["Published Helical Editor"]
    fallback["Read-only source preview<br/>Reason and original source"]
    session["EditorDocument"]
    assets["Host EditorAssets callbacks"]

    host -->|"document, editable, callbacks"| wrapper
    wrapper -->|"onchange, onerror"| host
    wrapper -->|"editable document"| editor
    wrapper -->|"unsupported source"| fallback
    editor -->|"JSON changes, image uploads"| wrapper
    wrapper -->|"update, upload"| session
    session -->|"resolve, upload"| assets
```

DocumentEditor renders either the Helical editor or the source preview. The host supplies the document session and asset callbacks. The wrapper forwards `focus()` to the mounted Helical editor.

### Layout

Editable document, including an inserted notice:

```text
+------------------------------------------------------------------+
|                                                                  |
|  A saved article                                                 |
|                                                                  |
|                                                                  |
|  Start writing your article here.                                |
|                                                                  |
|  +------------------------------------------------------------+  |
|  | [i] Note                                                   |  |
|  |     Add the notice body here.                              |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|                                                                  |
+------------------------------------------------------------------+
```

Unsupported source:

```text
+------------------------------------------------------------------+
|                                                                  |
|  This article contains syntax the editor cannot preserve.        |
|  The original source is shown read-only.                         |
|                                                                  |
|  :::chart                                                        |
|  {"series": [1, 2, 3]}                                           |
|  :::                                                             |
|                                                                  |
|                                                                  |
|                                                                  |
|                                                                  |
+------------------------------------------------------------------+
```

The wrapper occupies the host content area without a toolbar or footer of its own. Helical renders the editable blocks. The source fallback places its reason above the original text.

### Behavior

- Open supported source as an editable document with headings, text, lists, notices, code blocks, and images.
- Type `/` to find and insert a block. Edit notice titles, types, and bodies directly in the document.
- Display inserted images inline and retain their captions when reopening the document.
- Show unsupported source as read-only text with a reason instead of replacing or losing its content.
- Keep the current draft available when a change cannot be represented in the document format.
- Support keyboard selection in the slash menu, with Enter to insert and Escape to dismiss.

## Implementation

### State and Data Flow

Document states:

```mermaid
stateDiagram-v2
    state "Original source shown read-only" as ReadOnly
    state "Editing a serializable draft" as Editable
    state "Editing a draft that cannot serialize" as Retained

    [*] --> ReadOnly: open cannot preserve the source
    [*] --> Editable: open can preserve the source
    Editable --> Editable: update serializes successfully
    Editable --> Retained: update cannot preserve the edit
    Retained --> Editable: undo or correct the unsupported edit
    Retained --> Retained: copyDraft returns the draft as JSON
    ReadOnly --> [*]: host replaces the document session
    Editable --> [*]: host replaces the document session
    Retained --> [*]: host replaces the document session
```

An unsupported edit stays in the document. The user can continue editing or copy the draft while the host presents recovery choices.

Edit data flow:

```mermaid
flowchart TD
    editor["Helical editor<br/>Content, cursor, and selection"]
    update["EditorDocument.update<br/>Restore saved image paths and retain the draft"]
    encode["markdown.ts: encodeArticle<br/>Serialize, parse again, and compare content"]
    change["DocumentEditor: onchange<br/>Source text and title"]
    failure["DocumentEditor: onerror<br/>Error message and title"]
    host["Host<br/>File writes, save status, and recovery choices"]

    editor -->|"changed JSON"| update
    update -->|"draft JSON"| encode
    encode -->|"content preserved"| change
    encode -->|"conversion would lose content"| failure
    change --> host
    failure --> host
```

### Maintainer Notes

- Before saving, replace image display URLs with the source references returned by the host, such as `.images/photo.png`.
- If the document content is unchanged, return the original source exactly. This preserves its formatting and line endings.
- If conversion loses content, report an error and retain the latest draft. `copyDraft()` returns JSON when Markdown conversion fails.
- Test document sessions and image references in `document.test.ts`. Test Markdown conversion and supported blocks in `markdown.test.ts`.

[CLO-197](https://linear.app/cloudvoyant/issue/CLO-197/provide-a-self-contained-editor-service-for-document-loading-and) tracks moving document loading, conversion, and draft handling into Helical. Until then, keep these operations behind `EditorDocument`.
