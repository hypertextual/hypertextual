# Draw.io diagram block (`DrawioNodeView`)

## Overview

`DrawioNodeView` (`libs/ui/src/editor/components/drawio-block/DrawioNodeView.svelte`) is the Svelte 5 `NodeView` for `drawio` blocks (`libs/htmd-ts/src/editor/extensions/drawio-viewer.ts` and `libs/htmd-ts/src/nodes.ts`). It wraps [`FileViewer`](../file-viewer.md) with an editable `<figcaption>` matching `ImageNodeView.svelte`.

## Design

### Public API

`DrawioNodeViewProps` extends `SvelteNodeViewProps<HtmdEditor>`. Markdown images targeting `.drawio`, `.drawio.svg`, or `.drawio.png` (`![alt](.media/arch.drawio.svg "caption")`) parse into `drawio` block nodes and resolve through `EditorMediaService`.

### State and Data Flow

```mermaid
stateDiagram-v2
    [*] --> NormalInline: Open article with drawio block
    NormalInline --> NormalFullscreen: f / Ctrl+w z / Space d f / click Maximize
    NormalFullscreen --> NormalInline: Escape / f / q / Ctrl+w z
    NormalInline --> InsertCTA: i / Enter (focuses centered Open in Draw.io CTA)
    InsertCTA --> InsertCaption: Tab / click caption input
    InsertCaption --> InsertCTA: Shift+Tab
    InsertCTA --> NormalInline: Escape
    InsertCaption --> NormalInline: Escape
    InsertCTA --> ExternalOpen: Enter / click centered CTA
    NormalInline --> Deleted: Press d in normal mode
    InsertCTA --> Deleted: Click Remove button
```
