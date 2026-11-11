import { cn, mermaidSvgBase } from '@cloudvoyant/helical-ui'
import { cva, type VariantProps } from 'class-variance-authority'

export const mermaidViewerViewport =
  'relative flex h-full w-full cursor-grab items-center justify-center overflow-hidden touch-none outline-none active:cursor-grabbing'

export const mermaidViewerCanvasVariants = cva(
  cn(mermaidSvgBase, 'transition-transform duration-75'),
  {
    variants: {
      fit: {
        auto: '',
        contain:
          'flex h-full max-h-full w-full items-center justify-center [&>svg]:!h-full [&>svg]:!max-h-24 [&>svg]:!w-full [&>svg]:!max-w-full [&>svg]:object-contain',
      },
    },
    defaultVariants: {
      fit: 'auto',
    },
  },
)

export type MermaidViewerCanvasVariants = VariantProps<typeof mermaidViewerCanvasVariants>
