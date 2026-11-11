import {
  cn,
  windowBodyBase,
  windowContentBase,
  windowControlBase,
  windowHeaderBase,
  windowTitleBase,
} from '@cloudvoyant/helical-ui'
import { cva, type VariantProps } from 'class-variance-authority'

export const pipWindowVariants = cva(
  cn(
    windowContentBase,
    'z-20 flex flex-col overflow-hidden rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-md backdrop-blur-sm transition-[width,height] duration-150',
  ),
  {
    variants: {
      scope: {
        container: 'absolute',
        viewport: 'fixed z-40',
      },
      placement: {
        'bottom-right': 'right-3 bottom-3',
        'top-right': 'top-3 right-3',
        'bottom-left': 'bottom-3 left-3',
        'top-left': 'top-3 left-3',
      },
      minimized: {
        true: 'h-auto w-40',
        false: 'w-44 max-w-[calc(100%-1.5rem)]',
      },
    },
    defaultVariants: {
      scope: 'container',
      placement: 'top-right',
      minimized: false,
    },
  },
)

export type PipWindowVariants = VariantProps<typeof pipWindowVariants>

export const pipWindowHeader = cn(
  windowHeaderBase,
  'flex h-7 shrink-0 items-center justify-between gap-1.5 border-b border-border/70 bg-muted/60 px-2.5 py-1 text-xs select-none data-[minimized=true]:border-b-0',
)

export const pipWindowTitle = cn(
  windowTitleBase,
  'truncate font-medium text-xs text-muted-foreground',
)

export const pipWindowControls = 'flex items-center gap-0.5'

export const pipWindowControlButton = cn(
  windowControlBase,
  'inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-ring/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
)

export const pipWindowBody = cn(
  windowBodyBase,
  'relative flex h-28 w-full flex-1 items-center justify-center overflow-hidden bg-background/80 p-2',
)
