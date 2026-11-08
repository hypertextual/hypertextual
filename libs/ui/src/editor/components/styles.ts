import { cn, proseVariants } from '@cloudvoyant/helical-ui'
import { cva, type VariantProps } from 'class-variance-authority'

export const suggestionSurface =
  'w-72 rounded-md border border-border bg-popover text-popover-foreground shadow-lg'
export const suggestionContent = 'max-h-80 overflow-y-auto p-1 outline-none'
export const suggestionItem =
  'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[slash-selected]:bg-accent data-[slash-selected]:text-accent-foreground'

export const editorTypography = cn(
  proseVariants({ size: 'base' }),
  'focus:outline-none min-h-[500px] [&_h6]:text-sm [&_blockquote]:my-4 [&_blockquote_p:first-child]:mt-0 [&_blockquote_p:last-child]:mb-0',
)

export const editorSurface = cva(
  'editor-container relative [&_.ProseMirror]:relative [&_.ProseMirror]:outline-none [&_.ProseMirror_ul]:my-4 [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-4 [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ul>li]:list-disc [&_.ProseMirror_ol>li]:list-decimal [&_.ProseMirror_li]:my-1 [&_.ProseMirror_li]:pl-1 [&_.ProseMirror_li_p]:m-0 [&_.ProseMirror_li_p]:inline [&_.ProseMirror_ul[data-type=taskList]]:list-none [&_.ProseMirror_ul[data-type=taskList]]:pl-0 [&_.ProseMirror_ul[data-type=taskList]_li]:flex [&_.ProseMirror_ul[data-type=taskList]_li]:list-none [&_.ProseMirror_ul[data-type=taskList]_li]:items-start [&_.ProseMirror_ul[data-type=taskList]_li]:gap-2 [&_.ProseMirror_ul[data-type=taskList]_li>label]:mt-1 [&_.ProseMirror_ul[data-type=taskList]_li>label]:shrink-0 [&_.ProseMirror_ul[data-type=taskList]_li>div]:flex-1 [&_.ProseMirror_mark]:text-inherit',
)
export type EditorSurfaceVariants = VariantProps<typeof editorSurface>
export const codeContent =
  'editor-code-content m-0 rounded-none border-0 bg-transparent p-4 font-mono [&_code]:bg-transparent [&_code]:p-0'

export const mermaidRootVariants = cva(
  'mermaid-node-view relative my-4 overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-colors',
  {
    variants: {
      mode: {
        normal: 'select-none',
        jump: 'select-none',
        select: 'min-h-56',
        insert: 'min-h-56',
      },
    },
    defaultVariants: {
      mode: 'normal',
    },
  },
)
export type MermaidRootVariants = VariantProps<typeof mermaidRootVariants>

export const mermaidHeader =
  'flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs select-none'

export const mermaidTitle =
  'inline-flex items-center gap-1.5 font-mono text-xs font-medium text-muted-foreground'

export const mermaidToolbar = 'flex items-center gap-1'

export const mermaidToolbarButton =
  'inline-flex h-6 items-center justify-center gap-1 rounded px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export const mermaidZoomBadge =
  'min-w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground'

export const mermaidViewerCanvas =
  'relative flex min-h-48 w-full items-center justify-center overflow-hidden bg-background/60 p-6 outline-none'

export const mermaidCodeContainer = 'relative min-h-52 w-full bg-background/40 pr-76 pb-4'

export const mermaidFullscreenOverlay =
  'absolute inset-x-0 z-40 flex flex-col overflow-hidden bg-background text-foreground shadow-lg outline-none'

export const mermaidSplitCodePane =
  'flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-border bg-background data-[pane-focused=true]:ring-2 data-[pane-focused=true]:ring-inset data-[pane-focused=true]:ring-ring/50'

export const mermaidSplitPreviewPane =
  'relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden bg-muted/20 p-6 outline-none data-[pane-focused=true]:ring-2 data-[pane-focused=true]:ring-inset data-[pane-focused=true]:ring-ring/50'

export const mermaidSplitTextarea =
  'h-full w-full flex-1 resize-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-0'

export const mermaidErrorBanner =
  'rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger'
export const youtubeSurface = 'my-0 [&>button]:block [&>iframe]:block [&>button>img]:my-0'
export const noticeBody =
  "min-h-6 [&_p]:m-0 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:float-left data-[empty=true]:before:h-0 data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-['Add_the_notice_body_here.']"
export const imageSurface =
  'image-node-view relative my-6 group [.image-node-pending-delete_&]:bg-accent'
export const captionInput =
  'caption-input w-full border-0 bg-transparent text-center text-sm text-muted-foreground outline-none focus:border-0 focus:bg-transparent focus:ring-0'

export const textColors = [
  { id: 'red', preview: 'var(--danger)', name: 'Red' },
  { id: 'orange', preview: 'var(--warn)', name: 'Orange' },
  { id: 'yellow', preview: 'var(--chart-4)', name: 'Yellow' },
  { id: 'green', preview: 'var(--success)', name: 'Green' },
  { id: 'cyan', preview: 'var(--info)', name: 'Cyan' },
  { id: 'blue', preview: 'var(--chart-3)', name: 'Blue' },
  { id: 'violet', preview: 'var(--chart-5)', name: 'Violet' },
  { id: 'fuchsia', preview: 'var(--chart-1)', name: 'Fuchsia' },
  { id: 'slate', preview: 'var(--muted-foreground)', name: 'Slate' },
]

export const highlightColors = [
  { id: 'yellow', preview: 'var(--chart-4)', name: 'Yellow' },
  { id: 'blue', preview: 'var(--chart-3)', name: 'Blue' },
  { id: 'green', preview: 'var(--success)', name: 'Green' },
  { id: 'red', preview: 'var(--danger)', name: 'Red' },
  { id: 'fuchsia', preview: 'var(--chart-1)', name: 'Fuchsia' },
  { id: 'orange', preview: 'var(--warn)', name: 'Orange' },
  { id: 'violet', preview: 'var(--chart-5)', name: 'Violet' },
  { id: 'cyan', preview: 'var(--info)', name: 'Cyan' },
  { id: 'slate', preview: 'var(--muted-foreground)', name: 'Slate' },
]
