import { cva } from 'class-variance-authority'

export const fileViewerStyles = {
  rootVariants: cva('my-4', {
    variants: {
      standalone: {
        true: 'my-0 flex h-full w-full flex-1 flex-col rounded-none border-0 shadow-none',
        false: 'group/file-viewer my-0 rounded-none border-0 bg-transparent shadow-none',
      },
    },
    defaultVariants: {
      standalone: false,
    },
  }),
  canvas: 'relative w-full flex-1 bg-transparent p-0',
  drawioCanvas: 'relative aspect-[4/3] w-full flex-1 bg-transparent p-0',
  fullscreenCanvas: 'relative h-full min-h-0 w-full flex-1 bg-background p-0',
  image: 'block m-0 w-full h-auto !rounded-none select-none',
  fullscreenImage: 'm-0 h-full w-full !rounded-none select-none object-contain',
  xmlContainer: 'min-h-24 w-full max-w-full select-none text-center [&_*]:select-none',
  insertOverlay:
    'pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/45 backdrop-blur-[1px]',
  insertActions: 'pointer-events-auto flex items-center gap-2',
  actionButton:
    'inline-flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:border-ring focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  removeActionButton:
    'inline-flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground focus:border-ring focus:bg-destructive focus:text-destructive-foreground focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  floatingFullscreenButton:
    'absolute top-2 right-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm outline-none transition-opacity hover:bg-accent hover:text-accent-foreground focus:border-ring focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  toolbarButton:
    'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  toolbarIconButton:
    'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
}
