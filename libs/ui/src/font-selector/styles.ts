import { cva, type VariantProps } from 'class-variance-authority'

export const fontSelectorButtonVariants = cva('h-6 px-2 text-[11px] font-mono')
export type FontSelectorButtonVariants = VariantProps<typeof fontSelectorButtonVariants>
