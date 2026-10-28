import { cn, proseVariants } from '@cloudvoyant/helical-ui'
import { cva, type VariantProps } from 'class-variance-authority'

export const suggestionSurface =
  'w-72 rounded-md border border-border bg-popover text-popover-foreground shadow-lg'
export const suggestionContent = 'max-h-80 overflow-y-auto p-1 outline-none'
export const suggestionItem =
  'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

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
export const youtubeSurface = '[&>button>img]:my-0'
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
