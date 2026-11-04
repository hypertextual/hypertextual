<!-- libs/helical-svelte/src/editor/NoticeNodeView.svelte -->
<script lang="ts">
  import type { NoticeNodeViewProps } from './types'
  import type { NoticeVariants } from '@cloudvoyant/helical-ui'
  import { NodeViewContent, NodeViewWrapper } from 'svelte-tiptap'
  import { Selection } from '@tiptap/pm/state'
  import {
    isEditorInInsertMode,
    modalKeymapPluginKey,
    subscribeToEditorTransactions,
  } from '../core'
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
  const subscribe = createSubscriber((update) => subscribeToEditorTransactions(editor, update))
  const variants = [
    { value: 'info', label: 'Info', icon: Info },
    { value: 'success', label: 'Success', icon: CircleCheck },
    { value: 'warning', label: 'Warning', icon: TriangleAlert },
    { value: 'error', label: 'Error', icon: CircleX },
  ]

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && isEditorInInsertMode(editor)
  })
  const variant = $derived((node.attrs.variant as NoticeType | undefined) ?? 'info')

  const title = $derived((node.attrs.title as string | undefined) ?? 'Note')

  const modalSubtext = $derived.by(() => {
    subscribe()
    const st = modalKeymapPluginKey.getState(editor.state)?.subtextCursor
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

  // Methods -------------------------------------------------------------------
  function bodyStart(): number | null {
    const nodePosition = typeof getPos === 'function' ? getPos() : undefined
    return typeof nodePosition === 'number' ? nodePosition + 2 : null
  }

  function focusBody() {
    const position = bodyStart()
    if (position === null) return
    editor.commands.setTextSelection(position)
    // Focus synchronously so the next keystroke reaches the body rather than the title.
    editor.view.focus()
  }

  function focusBefore() {
    const position = getPos()
    if (typeof position !== 'number') return
    const selection = Selection.findFrom(editor.state.doc.resolve(position), -1, true)
    if (!selection) return
    editor.commands.setTextSelection(selection.from)
    editor.view.focus()
  }

  function handleHeaderKeydownCapture(event: KeyboardEvent) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const header = event.currentTarget as HTMLElement

    if (target.matches('input[aria-label="Notice title"]')) {
      if (event.key === 'Tab' && !event.shiftKey) {
        const trigger = header.querySelector<HTMLElement>(
          'button[data-part="trigger"], [aria-label="Notice type"][data-part="trigger"]',
        )
        if (trigger) {
          event.preventDefault()
          event.stopPropagation()
          trigger.focus()
        }
        return
      }
      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
        return
      }
      if (event.shiftKey) return
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        focusBefore()
      } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
      }
      return
    }

    const trigger = target.closest<HTMLElement>('[data-part="trigger"]')
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return
      if ((event.key === 'Tab' && !event.shiftKey) || event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
      } else if (event.key === 'Tab' && event.shiftKey) {
        const titleInput = header.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
        if (titleInput) {
          event.preventDefault()
          event.stopPropagation()
          titleInput.focus()
        }
      }
    }
  }
</script>

<NodeViewWrapper>
  <Notice {variant} class="editor-notice-node relative my-1 px-2 py-1">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center gap-2"
      contenteditable={false}
      onkeydowncapture={handleHeaderKeydownCapture}
    >
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
    <NodeViewContent data-empty={empty && editable} class={noticeBody} />
  </Notice>
</NodeViewWrapper>
