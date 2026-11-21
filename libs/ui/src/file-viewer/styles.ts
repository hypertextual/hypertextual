import { cva } from 'class-variance-authority'

export const fileViewerStyles = {
  rootVariants: cva('my-4', {
    variants: {
      standalone: {
        true: 'my-0 flex h-full w-full flex-1 flex-col rounded-none border-0 shadow-none',
        false: '',
      },
    },
    defaultVariants: {
      standalone: false,
    },
  }),
  canvas: 'relative min-h-64 w-full flex-1 bg-background/50 p-4',
  fullscreenCanvas: 'relative h-full min-h-0 w-full flex-1 bg-background p-6',
  image: 'max-h-[70vh] max-w-full select-none object-contain',
  fullscreenImage: 'max-h-[85vh] max-w-[90vw] select-none object-contain',
  xmlContainer: 'flex min-h-48 min-w-48 items-center justify-center',
  insertOverlay:
    'pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/45 backdrop-blur-[1px]',
  insertActions: 'pointer-events-auto flex items-center gap-2',
  prominentCta:
    'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  secondaryCta:
    'inline-flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  removeCta:
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/95 text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  toolbarButton:
    'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
  toolbarIconButton:
    'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
}
