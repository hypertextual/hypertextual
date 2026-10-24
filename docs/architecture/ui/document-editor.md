# Document editor

## Overview

DocumentEditor wraps the published Helical editor with a portable document API. Hosts exchange source text and title metadata without traversing editor JSON.

## Design

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

### Public API

`EditorDocument.open(source, assets?)` prepares a document. The session exposes title, editability, source, serialization, and draft-copy operations. `DocumentEditorProps` accepts the session, editability, and change/error callbacks. The component handle exposes `focus()`.

`EditorAssets` supplies `resolve(source)` and `upload(file)`. Upload results include a persisted source reference and a display URL. The host decides how storage works.

```svelte
<DocumentEditor document={session} onchange={saveChange} onerror={showRecovery} />
```

### State and Data Flow

The reusable session owns conversion, schema checks, draft content, and asset-reference mapping. Helical owns editing state. The application editor service owns revision-aware saves and recovery choices.

### Styling and Responsiveness

The wrapper uses published Helical UI. It does not impose a workspace shell or storage layout. The application constrains width and scrolling.

### Maintainer Notes

Keep runtime asset URLs out of serialized source. Preserve unchanged source and reject lossy conversions. Tests cover the public document API and consumer browser journeys. [CLO-197](https://linear.app/cloudvoyant/issue/CLO-197/provide-a-self-contained-editor-service-for-document-loading-and) tracks moving this service upstream into Helical.
