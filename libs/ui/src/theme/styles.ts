import { cva, type VariantProps } from 'class-variance-authority'

export const themeToggleButtonVariants = cva('ml-auto h-[26px] w-[26px] p-1')
export type ThemeToggleButtonVariants = VariantProps<typeof themeToggleButtonVariants>
