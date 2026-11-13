import {
  cn,
  codeBlockHeaderBase,
  codeBlockHeaderInfoBase,
  codeBlockRootBase,
  codeBlockTitleBase,
  windowControlBase,
} from '@cloudvoyant/helical-ui'
import { cva, type VariantProps } from 'class-variance-authority'

export const windowInplaceVariants = cva(
  cn(
    codeBlockRootBase,
    'relative my-4 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground transition-colors',
  ),
  {
    variants: {
      fullscreen: {
        true: 'fixed z-40 m-0 rounded-none border-0 shadow-lg outline-none',
        false: '',
      },
    },
    defaultVariants: {
      fullscreen: false,
    },
  },
)

export type WindowInplaceVariants = VariantProps<typeof windowInplaceVariants>

export const windowInplaceHeader = cn(
  codeBlockHeaderBase,
  'flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 text-xs select-none',
)

export const windowInplaceTitle = cn(
  codeBlockHeaderInfoBase,
  codeBlockTitleBase,
  'inline-flex items-center gap-1.5 font-mono text-xs font-medium text-muted-foreground',
)

export const windowInplaceToolbar = 'flex items-center gap-1'

export const windowInplaceControlButton = cn(
  windowControlBase,
  'inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-ring focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
)

export const windowInplaceBody = 'relative flex min-h-0 w-full flex-1 flex-col p-0'

export const windowInplaceFooter =
  'flex w-full shrink-0 items-center border-t border-border px-3 py-2 text-xs'
