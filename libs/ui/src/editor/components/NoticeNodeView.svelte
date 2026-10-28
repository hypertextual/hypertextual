<!-- libs/helical-svelte/src/editor/NoticeNodeView.svelte -->
<script lang="ts">
  import type { NoticeNodeViewProps } from './types'
  import type { NoticeVariants } from '@cloudvoyant/helical-ui'
  import { NodeViewContent, NodeViewWrapper } from 'svelte-tiptap'
  import { Notice } from '@cloudvoyant/helical-svelte'
  type NoticeType = Exclude<NoticeVariants['variant'], null | undefined | 'none'>

  // Props ---------------------------------------------------------------------
  let { node, editor, getPos, updateAttributes }: NoticeNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const variants: NoticeType[] = ['info', 'success', 'warning', 'error']

  // Derived -------------------------------------------------------------------
  const variant = $derived((node.attrs.variant as NoticeType | undefined) ?? 'info')

  const title = $derived((node.attrs.title as string | undefined) ?? 'Note')

  // Methods -------------------------------------------------------------------
  function bodyStart(): number | null {
    const nodePosition = typeof getPos === 'function' ? getPos() : undefined
    return typeof nodePosition === 'number' ? nodePosition + 2 : null
  }

  function focusBody() {
    const position = bodyStart()
    if (position !== null) editor.chain().focus().setTextSelection(position).run()
  }

  function handleTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      focusBody()
    }
  }
</script>

<NodeViewWrapper>
  <Notice {variant} class="editor-notice-node relative my-1 px-2 py-1">
    <div class="flex items-center gap-2" contenteditable={false}>
      <input
        aria-label="Notice title"
        value={title}
        oninput={(event) => updateAttributes({ title: event.currentTarget.value })}
        onkeydown={handleTitleKeydown}
        class="min-w-0 flex-1 bg-transparent font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
        placeholder="Notice title"
      />
      <select
        aria-label="Notice type"
        value={variant}
        onchange={(event) => updateAttributes({ variant: event.currentTarget.value })}
        class="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
      >
        {#each variants as value (value)}
          <option {value}>{value}</option>
        {/each}
      </select>
    </div>
    <NodeViewContent class="[&_p]:m-0" />
  </Notice>
</NodeViewWrapper>
