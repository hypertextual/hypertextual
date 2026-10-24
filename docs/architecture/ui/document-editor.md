# Document editor

## Overview

DocumentEditor wraps the published Helical editor with a portable document API. Hosts exchange source text and title metadata without traversing editor JSON.

## Design

### Layout

```text
Editable document
  Helical text, blocks, slash menu, and media

Unsupported document
  Reason
  Original source
```

The host supplies the reading width and surrounding controls. Helical supplies editing controls and block views.

### Behavior

- Default: Open supported source for editing. Preserve unsupported source as read-only text.
- Interaction: Emit serialized content and title changes. Upload and resolve images through the supplied asset adapter.
- Loading, empty, and error: EditorDocument prepares source before mounting. Failed conversion retains the draft and reports a typed failure.
- Accessibility: Published Helical editor controls retain their keyboard behavior. The source fallback has an accessible label.

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
