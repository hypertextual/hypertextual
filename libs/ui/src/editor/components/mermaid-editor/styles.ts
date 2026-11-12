import { cva, type VariantProps } from 'class-variance-authority'

export const mermaidRootVariants = cva('mermaid-node-view min-h-64', {
  variants: {
    mode: {
      normal: 'select-none',
      jump: 'select-none',
      select: '',
      insert: '',
    },
  },
  defaultVariants: {
    mode: 'normal',
  },
})

export type MermaidRootVariants = VariantProps<typeof mermaidRootVariants>

export const mermaidEditorStyles = {
  rootVariants: mermaidRootVariants,
  toolbarButton:
    'inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-ring focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  viewerCanvas:
    'relative flex min-h-64 w-full flex-1 items-center justify-center overflow-hidden bg-background p-6 outline-none',
  fullscreenViewerCanvas:
    'relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-background p-6 outline-none',
  codeContainer: 'relative flex min-h-64 w-full flex-1 flex-col overflow-auto bg-background',
  splitCodePane:
    'relative flex h-full min-h-0 w-1/2 flex-1 flex-col overflow-auto border-r border-border bg-background data-[pane-focused=true]:ring-2 data-[pane-focused=true]:ring-inset data-[pane-focused=true]:ring-ring/50',
  splitPreviewPane:
    'relative flex h-full min-h-0 w-1/2 flex-1 flex-col items-center justify-center overflow-hidden bg-background p-6 outline-none',
  errorFooter:
    'flex w-full shrink-0 items-center border-t border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger rounded-t-none rounded-b-lg',
}
