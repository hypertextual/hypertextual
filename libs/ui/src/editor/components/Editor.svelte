<script lang="ts">
  import { editorSurface, editorTypography } from './styles'
  import { cn } from '@cloudvoyant/helical-ui'
  import type { EditorProps, EditorOverlayViewProps } from './types'
  import { onMount, onDestroy, setContext, getAllContexts, type Component } from 'svelte'
  import { editorModeKey } from './mode'
  import { Editor, type EditorOptions } from '@tiptap/core'
  import { SvelteNodeViewRenderer } from 'svelte-tiptap'
  import {
    buildExtensions,
    type SlashCommandItem,
    type MentionItem,
    type MentionListElement,
    type EditorCounts,
    type EditorOverlayDefinition,
    type EditorOverlayState,
  } from '../core'
  import BubbleMenuContent from './BubbleMenu.svelte'
  import SlashMenu from './SlashMenu.svelte'
  import BookmarkInput from './BookmarkInput.svelte'
  import ImageInput from './ImageInput.svelte'
  import YouTubeInput from './YouTubeInput.svelte'
  import ImageNodeView from './ImageNodeView.svelte'
  import UrlMentionPill from './UrlMentionPill.svelte'
  import LinkPreviewCard from './LinkPreviewCard.svelte'
  import CodeBlockComponent from './CodeBlockComponent.svelte'
  import NoticeNodeView from './NoticeNodeView.svelte'
  import MentionList from './MentionList.svelte'
  import CursorOverlay from './CursorOverlay.svelte'
  import type { SuggestionProps } from '@tiptap/suggestion'
  import type { JSONContent } from '@tiptap/core'

  // Props ---------------------------------------------------------------------
  let {
    content,
    editable = true,
    onedit,
    enforceTitle = true,
    onchange,
    mentionSource,
    hrefBuilder,
    onUpload,
    fetchLinkPreview,
  }: EditorProps = $props()

  // State ---------------------------------------------------------------------
  let editor = $state<Editor | null>(null)
  const mode = $state({ editable: false })
  setContext(editorModeKey, mode)
  const nodeViewContext = getAllContexts()

  let element: HTMLDivElement

  let slashMenuProps = $state<SuggestionProps<SlashCommandItem> | null>(null)

  // The mention menu renders from the template (like the slash menu) rather than being mounted
  // into document.body: that is the pattern already proven to work in this component, and it
  // keeps keydown delegation on a bound element instead of a detached mount.
  let mentionMenuProps = $state<SuggestionProps<MentionItem> | null>(null)

  let mentionMenuCoords = $state({ left: 0, top: 0 })

  let mentionMenuEl = $state<HTMLElement | null>(null)

  let slashMenuSurface = $state<HTMLDivElement | null>(null)

  let activeOverlay = $state.raw<EditorOverlayState | null>(null)

  const overlayViews: Record<string, Component<EditorOverlayViewProps>> = {
    image: ImageInput,
    bookmark: BookmarkInput,
    youtube: YouTubeInput,
  }

  const overlays: Record<string, EditorOverlayDefinition> = {
    image: { width: 320, height: 480, gap: 4 },
    bookmark: { width: 320, height: 240, gap: 4 },
    youtube: { width: 320, height: 220, gap: 4 },
  }

  const SLASH_OVERLAY = { width: 288, height: 288 }

  // Derived -------------------------------------------------------------------
  const OverlayInput = $derived(activeOverlay ? overlayViews[activeOverlay.name] : undefined)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const props = slashMenuProps
    if (!props || !slashMenuSurface) return
    const binding = props.editor.storage.editorOverlays.attach(slashMenuSurface, {
      anchor: () => slashMenuProps?.range.to ?? null,
      width: SLASH_OVERLAY.width,
      height: SLASH_OVERLAY.height,
      gap: 4,
      lockScroll: true,
    })
    return binding.destroy
  })

  onMount(() => {
    // Cleanup any existing editor first (helps with hot reload)
    if (editor) {
      editor.destroy()
      editor = null
    }

    const nodeViews = {
      image: () => SvelteNodeViewRenderer(ImageNodeView, { context: new Map(nodeViewContext) }),
      urlMention: () =>
        SvelteNodeViewRenderer(UrlMentionPill, { context: new Map(nodeViewContext) }),
      linkPreview: () =>
        SvelteNodeViewRenderer(LinkPreviewCard, { context: new Map(nodeViewContext) }),
      codeBlock: () =>
        SvelteNodeViewRenderer(CodeBlockComponent, { context: new Map(nodeViewContext) }),
      notice: () => SvelteNodeViewRenderer(NoticeNodeView, { context: new Map(nodeViewContext) }),
    }

    editor = new Editor({
      element,
      ...({ immediatelyRender: false } as unknown as Partial<EditorOptions>),
      extensions: buildExtensions({
        mentionSource,
        hrefBuilder,
        enforceTitle,
        nodeViews,
        overlays,
        onOverlayChange: (overlay) => {
          activeOverlay = overlay
        },
        mentionRender: () => ({
          onStart: (props: SuggestionProps<MentionItem>) => {
            mentionMenuProps = props
            const rect = props.clientRect?.()
            if (rect) mentionMenuCoords = { left: rect.left, top: rect.bottom + 8 }
          },
          onUpdate: (props: SuggestionProps<MentionItem>) => {
            mentionMenuProps = props
            const rect = props.clientRect?.()
            if (rect) mentionMenuCoords = { left: rect.left, top: rect.bottom + 8 }
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
              props.event.preventDefault()
              props.event.stopPropagation()
              return true
            }
            // MentionList exposes its handler on the element (see its $effect).
            const child = mentionMenuEl?.firstElementChild as MentionListElement | null
            return child?.__mentionListKeyDown?.(props.event) ?? false
          },
          onExit: () => {
            mentionMenuProps = null
          },
        }),
        // The slash menu is rendered from this component's template (see `slashMenuProps`).
        slashRender: () => ({
          onStart: (props: SuggestionProps<SlashCommandItem>) => {
            slashMenuProps = props
          },
          onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
            slashMenuProps = props
          },
          onExit: () => {
            slashMenuProps = null
          },
        }),
      }),
      content: content ?? {
        type: 'doc',
        content: enforceTitle
          ? [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [],
              },
              {
                type: 'paragraph',
                content: [],
              },
            ]
          : [
              {
                type: 'paragraph',
                content: [],
              },
            ],
      },
      editable,
      onUpdate: ({ editor }) => {
        onchange?.(editor.getJSON())
      },
      editorProps: {
        handleClick(view, position, event) {
          if (view.editable || !onedit) return false
          const target = event.target
          if (
            target instanceof Element &&
            target.closest(
              'a, button, input, select, summary, iframe, [role="button"], [role="combobox"]',
            )
          )
            return false
          onedit()
          // Enable before ProseMirror places the caret for this click.
          editor?.setEditable(true, false)
          editor?.commands.setTextSelection(position)
          view.focus()
          return true
        },
        attributes: {
          class: editorTypography,
        },
      },
    })
  })

  onDestroy(() => {
    if (editor) {
      editor.destroy()
    }
  })

  // Update editable state
  $effect(() => {
    mode.editable = editable
    if (editor) {
      editor.setEditable(editable, false)
      if (!editable) {
        if (activeOverlay) editor.commands.closeOverlay(activeOverlay.name)
        slashMenuProps = null
        mentionMenuProps = null
      }
    }
  })

  // Methods -------------------------------------------------------------------
  function closeOverlay(name: string) {
    editor?.commands.closeOverlay(name)
  }

  // Expose method to update content externally
  export function updateContent(newContent: JSONContent) {
    if (editor && !editor.schema.nodeFromJSON(newContent).eq(editor.state.doc))
      editor.commands.setContent(newContent, { emitUpdate: false })
  }

  // Expose focus method
  export function focus() {
    if (editor) {
      editor.commands.focus('start')
    }
  }

  // Expose method to get analytics counts
  export function getCounts(): EditorCounts {
    if (!editor) {
      return { wordCount: 0, charCount: 0, pageCount: 0, readDuration: 0 }
    }

    const wordCount = editor.storage.characterCount?.words() || 0
    const charCount = editor.storage.characterCount?.characters() || 0
    const pageCount = Math.max(1, Math.ceil(wordCount / 300))
    const readDuration = Math.max(1, Math.ceil(wordCount / 250))

    return { wordCount, charCount, pageCount, readDuration }
  }
</script>

<div class={cn(editorSurface())}>
  <div bind:this={element}></div>
  {#if editor && editable}
    <BubbleMenuContent {editor} />
    {#if slashMenuProps}
      <div bind:this={slashMenuSurface} data-slash-menu-surface class="fixed z-50">
        <SlashMenu
          items={slashMenuProps.items || []}
          command={(item) => slashMenuProps?.command?.(item)}
        />
      </div>
    {/if}
    {#if mentionMenuProps}
      <div
        bind:this={mentionMenuEl}
        class="fixed z-50"
        style="left: {mentionMenuCoords.left}px; top: {mentionMenuCoords.top}px;"
      >
        <MentionList
          items={mentionMenuProps.items || []}
          command={(item) => mentionMenuProps?.command?.(item)}
          clientRect={mentionMenuProps.clientRect ?? null}
        />
      </div>
    {/if}
    {#if activeOverlay && OverlayInput}
      {#key activeOverlay.name}
        <CursorOverlay {editor} position={activeOverlay.position} {...activeOverlay.definition}>
          <OverlayInput
            {editor}
            position={activeOverlay.position}
            data={activeOverlay.data}
            {onUpload}
            {fetchLinkPreview}
            onClose={closeOverlay.bind(null, activeOverlay.name)}
          />
        </CursorOverlay>
      {/key}
    {/if}
  {/if}
</div>
