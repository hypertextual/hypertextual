<script lang="ts">
  import { Popover } from '@ark-ui/svelte/popover'
  import type { BubbleMenuProps } from './types'
  import { onMount } from 'svelte'
  import FontColorPicker from './FontColorPicker.svelte'
  import LinkEditPopover from './LinkEditPopover.svelte'
  import { Link2 } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let props: BubbleMenuProps = $props()

  // State ---------------------------------------------------------------------
  let menu = $state<HTMLElement | null>(null)

  let showLinkInput = $state(false)

  let linkUrl = $state('')

  let showFontColorPicker = $state(false)

  let showHighlightPicker = $state(false)

  let isVisible = $state(false)

  let currentTextColor = $state<string | null>(null)

  let currentHighlight = $state<string | null>(null)

  let dismissedSelection = $state<string | null>(null)

  // Lifecycle -----------------------------------------------------------------
  // Reset picker states when menu closes
  $effect(() => {
    if (!isVisible) {
      showFontColorPicker = false
      showHighlightPicker = false
      showLinkInput = false
    }
  })

  $effect(() => {
    if (!menu || !isVisible) return
    const binding = props.editor.storage.editorOverlays.attach(menu, {
      anchor: () => 'selection',
      width: 480,
      height: 40,
      placement: 'top',
      align: 'center',
      gap: 8,
      viewportGap: 8,
      lockScroll: () => showLinkInput,
    })
    return binding.destroy
  })

  onMount(() => {
    if (!props.editor) return

    // Update on selection change
    props.editor.on('selectionUpdate', updateVisibility)
    props.editor.on('transaction', updateVisibility)

    // Initial update
    const initialFrame = requestAnimationFrame(updateVisibility)

    return () => {
      cancelAnimationFrame(initialFrame)
      props.editor.off('selectionUpdate', updateVisibility)
      props.editor.off('transaction', updateVisibility)
    }
  })

  // Methods -------------------------------------------------------------------
  function updateColors() {
    if (!props.editor) return
    currentTextColor = props.editor.getAttributes('textStyle')?.color || null
    currentHighlight = props.editor.getAttributes('highlight')?.color || null
  }

  function updateVisibility() {
    if (!props.editor) return

    const { from, to, empty } = props.editor.state.selection
    const selectionKey = `${from}:${to}`

    if (dismissedSelection === selectionKey) {
      isVisible = false
      return
    }
    if (dismissedSelection && dismissedSelection !== selectionKey) dismissedSelection = null

    // Image node selections use their own controls; the text bubble menu must stay hidden.
    if (props.editor.isActive('imageNode')) {
      isVisible = false
      showLinkInput = false
      return
    }

    // Hide if the editor is blurred or there is no text selection.
    if ((!props.editor.isFocused && !showLinkInput) || empty || from === to) {
      isVisible = false
      showLinkInput = false
      return
    }

    isVisible = true
    updateColors()

    // Auto-show link popover when selecting a link
    const isLinkActive = props.editor.isActive('link')
    const isInternalMentionActive = props.editor.isActive('internalMention')

    if (isLinkActive && !isInternalMentionActive) {
      showLinkInput = true
      const { href } = props.editor.getAttributes('link')
      linkUrl = href || ''
    }
  }

  function toggleBold() {
    props.editor.chain().focus().toggleBold().run()
  }

  function toggleItalic() {
    props.editor.chain().focus().toggleItalic().run()
  }

  function toggleUnderline() {
    props.editor.chain().focus().toggleUnderline().run()
  }

  function toggleStrike() {
    props.editor.chain().focus().toggleStrike().run()
  }

  function toggleLink() {
    // Always show input to add or edit link
    showLinkInput = true
    const { href } = props.editor.getAttributes('link')
    linkUrl = href || ''
  }
</script>

<Popover.Root
  open={isVisible}
  autoFocus={false}
  onOpenChange={({ open }) => {
    if (!open) {
      dismissedSelection = `${props.editor.state.selection.from}:${props.editor.state.selection.to}`
      isVisible = false
    }
  }}
>
  <Popover.Content
    bind:ref={menu}
    onmousedown={(event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-link-editor]')) return
      event.preventDefault()
    }}
    role="toolbar"
    aria-label="Text formatting"
    tabindex={-1}
    class="fixed z-50 flex items-center gap-1 rounded-lg border bg-popover text-popover-foreground p-1 shadow-lg transition-opacity"
    style="opacity: {isVisible ? 1 : 0}; pointer-events: {isVisible ? 'auto' : 'none'}"
  >
    <!-- Text formatting -->
    <button
      type="button"
      class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {props.editor.isActive(
        'bold',
      )
        ? 'bg-accent text-accent-foreground'
        : ''}"
      onclick={toggleBold}
      aria-label="Bold"
      title="Bold"
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {props.editor.isActive(
        'italic',
      )
        ? 'bg-accent text-accent-foreground'
        : ''}"
      onclick={toggleItalic}
      aria-label="Italic"
      title="Italic"
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {props.editor.isActive(
        'underline',
      )
        ? 'bg-accent text-accent-foreground'
        : ''}"
      onclick={toggleUnderline}
      aria-label="Underline"
      title="Underline"
    >
      <u>U</u>
    </button>
    <button
      type="button"
      class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {props.editor.isActive(
        'strike',
      )
        ? 'bg-accent text-accent-foreground'
        : ''}"
      onclick={toggleStrike}
      aria-label="Strikethrough"
      title="Strikethrough"
    >
      <s>S</s>
    </button>

    <!-- Divider -->
    <div class="w-px h-6 bg-border mx-1"></div>

    <!-- Color and Highlight -->
    <div class="relative">
      <button
        type="button"
        class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {currentHighlight
          ? 'bg-accent text-accent-foreground'
          : ''}"
        onclick={() => (showHighlightPicker = !showHighlightPicker)}
        data-state={currentHighlight ? 'on' : 'off'}
        aria-label="Highlight"
        title="Highlight"
      >
        <span class="relative inline-block">
          H
          {#if currentHighlight}
            <span
              class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full"
              style="background-color: {currentHighlight}"
            ></span>
          {/if}
        </span>
      </button>
      <FontColorPicker editor={props.editor} bind:visible={showHighlightPicker} mode="highlight" />
    </div>
    <div class="relative">
      <button
        type="button"
        class="rounded px-3 py-1 hover:bg-accent hover:text-accent-foreground {currentTextColor
          ? 'bg-accent text-accent-foreground'
          : ''}"
        onclick={() => (showFontColorPicker = !showFontColorPicker)}
        data-state={currentTextColor ? 'on' : 'off'}
        aria-label="Text Color"
        title="Text Color"
      >
        <span class="relative inline-block">
          A
          {#if currentTextColor}
            <span
              class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full"
              style="background-color: {currentTextColor}"
            ></span>
          {/if}
        </span>
      </button>
      <FontColorPicker editor={props.editor} bind:visible={showFontColorPicker} mode="color" />
    </div>

    <!-- Link -->
    <div class="relative">
      <button
        type="button"
        class="rounded px-2 py-1 hover:bg-accent hover:text-accent-foreground {props.editor.isActive(
          'link',
        )
          ? 'bg-accent text-accent-foreground'
          : ''}"
        onclick={toggleLink}
        aria-label="Link"
        title="Link"
      >
        <Link2 size={16} />
      </button>
      {#if showLinkInput}
        <LinkEditPopover
          editor={props.editor}
          initialUrl={linkUrl}
          onClose={() => {
            showLinkInput = false
            linkUrl = ''
          }}
        />
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
