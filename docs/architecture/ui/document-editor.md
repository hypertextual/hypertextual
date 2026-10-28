# Document editor

## Overview

DocumentEditor hosts the local Svelte editor with a native ProseMirror JSON API. The app supplies parsed content and receives document changes. Every supported node, mark, and attribute must survive the app's full save/reopen workflow, including formatting on whitespace.

## Design

### Public API

`DocumentEditorProps` accepts `document: JSONContent`, optional `editable`, and `onchange(document: JSONContent)`. The optional `onUpload(file)` callback returns an image display `src` and optional `srcset`. The component handle exposes `focus()`.

```svelte
<DocumentEditor
  document={article.content}
  editable={!workspace.blocked}
  onchange={(document) => editor.change(document)}
  onUpload={uploadImage}
/>
```

The app's `ArticleViewModel` owns source, draft, display JSON, title extraction, and pure document transformations. `EditorService` coordinates format validation, files, media, and autosave. The workspace-aware `MediaService` fetches and uploads local and remote assets. Unsupported nodes remain editable as raw-source wrappers; `ContentPane` shows the whole source only after an unrecoverable parser failure. These services and views are outside the reusable component.

### Component Diagram

```mermaid
flowchart TD
    app[App ArticleViewModel and editor service] -->|PM JSON| host[App ContentPane]
    host -->|document, editable, onUpload| wrapper[DocumentEditor]
    wrapper -->|PM JSON changes| app
    wrapper --> view[Local Svelte Editor]
    view -->|upload callback| app
    app --> SDK[htmd-ts]
    app --> FS[App filesystem client]
    host -->|unrecoverable parser failure| preview[App-owned source preview]
    view --> surfaces[Insertion forms, slash menu, bubble toolbar]
    surfaces -->|rendered surface and anchor| overlays[EditorOverlays]
    overlays -->|position, scroll lock, cleanup| surfaces
```

DocumentEditor renders the local editor and forwards its focus handle. It does not import the format SDK, parse Markdown, or perform filesystem operations.

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

The wrapper fills the host content area without a toolbar or footer of its own. The local editor renders blocks with Helical and Ark controls. The app owns loading, save status, source previews, and recovery dialogs.

### State and Data Flow

```mermaid
stateDiagram-v2
    state "Editable PM document" as Editable
    state "Editing disabled by host" as Disabled
    [*] --> Editable: host supplies document
    Editable --> Editable: emit JSON change to app
    Editable --> Disabled: editable becomes false
    Disabled --> Editable: editable becomes true
    Editable --> [*]: host replaces or unmounts document
    Disabled --> [*]: host replaces or unmounts document
```

The editor keeps selection, transactions, node views, and interaction state. The app processes emitted JSON synchronously through `htmd-ts` before scheduling a save. Format or storage errors retain the app draft and open app recovery. Replacing the article destroys the previous editor and overlay bindings.

### Behavior

```mermaid
stateDiagram-v2
    [*] --> Editing
    Editing --> BlockMenu: type slash in a text block
    BlockMenu --> BlockMenu: filter or move with arrow keys
    BlockMenu --> Editing: Enter inserts a direct block
    BlockMenu --> InsertionForm: choose image, bookmark, or YouTube
    InsertionForm --> InsertionForm: map anchor through document edits
    InsertionForm --> Editing: submit or cancel
    InsertionForm --> Editing: anchor deleted or article replaced
    BlockMenu --> Editing: Escape cancels
    Editing --> Formatting: select text
    Formatting --> Editing: apply formatting or dismiss
```

The component disables forced-title enforcement. The app extracts the first H1 from document JSON for display titles and saved filenames. `EditorOverlays` owns insertion requests, surface positioning, and scroll locks. Forms follow mapped document anchors, slash suggestions follow their range, and the toolbar follows selection. Svelte and Ark own the controls and keyboard interaction. Text formatting includes highlight and font color; text alignment is unavailable for both headings and paragraphs.

## Implementation

- Compose published Helical prose variants for editor typography. Keep app CSS to layout so heading sizes and spacing have one owner. Avoid Tailwind Typography inside the editor; its generated quote characters and code margins are for rendered prose.
- Render editable code without whitespace around its node-view content. Place the language selector at the left of the shared code-block header.

- Keep component props and change events as native JSON, without encoded JSON strings or source sessions.
- Supply framework node views through configured Tiptap extensions. Keep format and filesystem dependencies outside the UI package.
- Use `@hypertextual/ui/editor-schema` for app schema agreement tests. Cover format syntax in SDK BDD integration examples.
- Cover interaction and overlays in `e2e/hypertextual-desktop/editor.spec.ts`. Do not add tests inside UI extensions.
- See [editor source ownership](editor-source.md) for provenance, dependencies, coverage, and the upstream transplant procedure.
