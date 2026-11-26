import { cva, type VariantProps } from 'class-variance-authority'

/** Linear-like minimal tab strip styles using semantic Helical theme tokens. */
export const tabsStyles = {
  root: 'flex w-full min-w-0 items-center border-b border-border/70 bg-background/80 px-2 select-none',
  list: cva(
    'flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    {
      variants: {
        size: {
          sm: 'min-h-[30px]',
          md: 'min-h-[34px]',
        },
      },
      defaultVariants: {
        size: 'sm',
      },
    },
  ),
  itemContainer: cva(
    'group relative flex max-w-[200px] shrink-0 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[selected]:bg-muted/80 data-[selected]:text-foreground',
    {
      variants: {
        size: {
          sm: 'h-[24px] pr-1',
          md: 'h-[28px] pr-1.5',
        },
      },
      defaultVariants: {
        size: 'sm',
      },
    },
  ),
  trigger: cva(
    'flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate bg-transparent text-left font-medium outline-none',
    {
      variants: {
        size: {
          sm: 'px-2 text-[12px] leading-none',
          md: 'px-2.5 text-[13px] leading-none',
        },
      },
      defaultVariants: {
        size: 'sm',
      },
    },
  ),
  dirtyIndicator: 'h-1.5 w-1.5 shrink-0 rounded-full bg-primary',
  closeButton:
    'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 group-data-[selected]:opacity-75 group-data-[selected]:hover:opacity-100',
} as const

export type TabsListVariants = VariantProps<typeof tabsStyles.list>
export type TabsTriggerVariants = VariantProps<typeof tabsStyles.trigger>
