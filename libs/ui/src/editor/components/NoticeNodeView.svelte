<script lang="ts">
  import type { NoticeNodeViewProps } from './types'
  import type { NoticeVariants } from '@cloudvoyant/helical-ui'
  import { noticeBody } from './styles'
  import { createSubscriber } from 'svelte/reactivity'
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
  const subscribe = createSubscriber((update) => editor.subscribe(update))
  const variants = [
    { value: 'info', label: 'Info', icon: Info },
    { value: 'success', label: 'Success', icon: CircleCheck },
    { value: 'warning', label: 'Warning', icon: TriangleAlert },
    { value: 'error', label: 'Error', icon: CircleX },
  ]

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && editor.isInsertMode
  })
  const variant = $derived((node.attrs.variant as NoticeType | undefined) ?? 'info')

  const title = $derived((node.attrs.title as string | undefined) ?? 'Note')

  const modalSubtext = $derived.by(() => {
    subscribe()
    const st = editor.getSubtextCursor()
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (!st || st.kind !== 'noticeTitle' || st.pos !== pos) return null
    return st
  })

  const modalCharRange = $derived.by(() => {
    if (!modalSubtext) return null
    if (typeof modalSubtext.anchorOffset === 'number') {
      const from = Math.min(modalSubtext.anchorOffset, modalSubtext.offset)
      const to = Math.max(modalSubtext.anchorOffset, modalSubtext.offset)
      return { from, to: Math.max(from + 1, to) }
    }
    return { from: modalSubtext.offset, to: modalSubtext.offset + 1 }
  })

  const empty = $derived(
    node.childCount === 1 &&
      node.firstChild?.type.name === 'paragraph' &&
      node.firstChild.content.size === 0,
  )
</script>

<div data-node-view-wrapper="" role="none" style="white-space: normal;">
  <Notice {variant} class="editor-notice-node relative my-1 px-2 py-1">
    <div class="flex items-center gap-2" contenteditable={false}>
      {#if editable}
        <input
          aria-label="Notice title"
          value={title}
          oninput={(event) => updateAttributes({ title: event.currentTarget.value })}
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
          <SelectTrigger
            aria-label="Notice type"
            size="sm"
            class="min-w-36 justify-between text-xs focus:border-ring focus:ring-2 focus:ring-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SelectValue />
            <SelectIndicator><ChevronsUpDown class="size-3 opacity-50" /></SelectIndicator>
          </SelectTrigger>
          <SelectContent data-editor-controls>
            {#each variants as item (item.value)}
              <SelectItem {item}>
                <item.icon class="size-4" aria-hidden="true" />
                <SelectItemText>{item.label}</SelectItemText>
                <SelectItemIndicator><Check class="size-4" /></SelectItemIndicator>
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      {:else if modalCharRange}
        <span data-notice-title-text class="font-semibold tracking-tight"
          >{title.slice(0, modalCharRange.from)}<span
            class="pm-modal-cursor"
            data-pm-modal-cursor="normal"
            >{title.slice(modalCharRange.from, modalCharRange.to) || '\u00a0'}</span
          >{title.slice(modalCharRange.to)}</span
        >
      {:else}
        <span data-notice-title-text class="font-semibold tracking-tight">{title}</span>
      {/if}
    </div>
    <div
      data-node-view-content=""
      style="white-space: pre-wrap;"
      data-empty={empty && editable}
      class={noticeBody}
    ></div>
  </Notice>
</div>
