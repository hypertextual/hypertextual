<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { WindowInplaceFooter } from '../../../window-inplace'
  import { mermaidEditorStyles } from './styles'
  import type { MermaidErrorBarProps } from './types'

  // Props ---------------------------------------------------------------------
  let { error, isFullscreen = false, class: className }: MermaidErrorBarProps = $props()
</script>

<WindowInplaceFooter
  role="alert"
  data-mermaid-error=""
  class={cn(
    mermaidEditorStyles.errorFooter,
    isFullscreen ? 'rounded-b-none' : 'rounded-b-lg',
    className,
  )}
>
  {error}
</WindowInplaceFooter>
