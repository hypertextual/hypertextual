<!-- libs/helical-svelte/src/editor/NoticeNodeView.svelte -->
<script lang="ts">
  import type { NoticeNodeViewProps } from './types'
  import type { NoticeVariants } from '@cloudvoyant/helical-ui'
  import { NodeViewContent, NodeViewWrapper } from 'svelte-tiptap'
  import {
    Notice,
    Select,
    SelectTrigger,
    SelectValue,
    SelectIndicator,
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectItemIndicator,
  } from '@cloudvoyant/helical-svelte'
  import { Check, ChevronsUpDown, Info, CircleCheck, TriangleAlert, CircleX } from 'lucide-svelte'
  type NoticeType = Exclude<NoticeVariants['variant'], null | undefined | 'none'>

  // Props ---------------------------------------------------------------------
  let { node, editor, getPos, updateAttributes }: NoticeNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const variants = [
    { value: 'info', label: 'Info', icon: Info },
    { value: 'success', label: 'Success', icon: CircleCheck },
    { value: 'warning', label: 'Warning', icon: TriangleAlert },
    { value: 'error', label: 'Error', icon: CircleX },
  ]

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
      <Select
        items={variants}
        value={[variant]}
        onValueChange={(details) => {
          const next = details.value[0]
          if (next) updateAttributes({ variant: next })
        }}
      >
        <SelectTrigger aria-label="Notice type" size="sm" class="min-w-36 justify-between text-xs">
          <SelectValue />
          <SelectIndicator><ChevronsUpDown class="size-3 opacity-50" /></SelectIndicator>
        </SelectTrigger>
        <SelectContent>
          {#each variants as item (item.value)}
            <SelectItem {item}>
              <item.icon class="size-4" aria-hidden="true" />
              <SelectItemText>{item.label}</SelectItemText>
              <SelectItemIndicator><Check class="size-4" /></SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
    <NodeViewContent class="[&_p]:m-0" />
  </Notice>
</NodeViewWrapper>
