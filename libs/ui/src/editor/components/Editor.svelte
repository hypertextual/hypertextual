<script lang="ts">
  import { editorSurface, editorTypography } from './styles'
  import { cn } from '@cloudvoyant/helical-ui'
  import { useOptionalWhichKeyController } from '@cloudvoyant/helical-svelte'
  import type { EditorProps, EditorOverlayViewProps } from './types'
  import { onMount, onDestroy, type Component } from 'svelte'
  import {
    HtmdEditor,
    type EditorCounts,
    type HtmdOverlayDefinition,
    type HtmdOverlayState,
    type HtmdSuggestionMenuProps,
    type JSONContent,
    type MentionItem,
    type SlashCommandItem,
  } from 'htmd-ts'
  import { createSvelteNodeView } from './svelte-node-view.svelte'
  import BubbleMenuContent from './BubbleMenu.svelte'
  import SlashMenu from './SlashMenu.svelte'
  import BookmarkInput from './BookmarkInput.svelte'
  import ImageInput from './ImageInput.svelte'
  import YouTubeInput from './YouTubeInput.svelte'
  import ImageNodeView from './ImageNodeView.svelte'
  import UrlMentionPill from './UrlMentionPill.svelte'
  import LinkPreviewCard from './LinkPreviewCard.svelte'
  import CodeBlockComponent from './CodeBlockComponent.svelte'
  import MermaidNodeView from './MermaidNodeView.svelte'
  import NoticeNodeView from './NoticeNodeView.svelte'
  import MentionList from './MentionList.svelte'
  import CursorOverlay from './CursorOverlay.svelte'

  // Props ---------------------------------------------------------------------
  let {
    content,
    editable = true,
    clickToEdit = true,
    onedit,
    onexit,
    enforceTitle = true,
    onchange,
    mentionSource,
    hrefBuilder,
    onUpload,
    fetchLinkPreview,
    services,
  }: EditorProps = $props()

  // State ---------------------------------------------------------------------
  const whichKeyController = useOptionalWhichKeyController()

  let editor = $state<HtmdEditor | null>(null)

  let surfaceEl: HTMLDivElement

  let element: HTMLDivElement

  let slashMenuProps = $state<HtmdSuggestionMenuProps<SlashCommandItem> | null>(null)

  let mentionMenuProps = $state<HtmdSuggestionMenuProps<MentionItem> | null>(null)

  let mentionMenuCoords = $state({ left: 0, top: 0 })

  let slashMenuSurface = $state<HTMLDivElement | null>(null)

  let activeOverlay = $state.raw<HtmdOverlayState | null>(null)

  const overlayViews: Record<string, Component<EditorOverlayViewProps>> = {
    image: ImageInput,
    bookmark: BookmarkInput,
    youtube: YouTubeInput,
  }

  const overlays: Record<string, HtmdOverlayDefinition> = {
    image: { width: 320, height: 480, gap: 4 },
    bookmark: { width: 320, height: 240, gap: 4 },
    youtube: { width: 320, height: 220, gap: 4 },
  }

  const SLASH_OVERLAY = { width: 288, height: 288 }

  const nodeViews = {
    image: createSvelteNodeView(ImageNodeView),
    urlMention: createSvelteNodeView(UrlMentionPill, { as: 'span' }),
    linkPreview: createSvelteNodeView(LinkPreviewCard),
    codeBlock: createSvelteNodeView(CodeBlockComponent),
    mermaid: createSvelteNodeView(MermaidNodeView),
    notice: createSvelteNodeView(NoticeNodeView),
  }

  // Derived -------------------------------------------------------------------
  const OverlayInput = $derived(activeOverlay ? overlayViews[activeOverlay.name] : undefined)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const props = slashMenuProps
    if (!props || !slashMenuSurface || !editor) return
    const binding = editor.attachOverlaySurface(slashMenuSurface, {
      anchor: () => slashMenuProps?.range.to ?? null,
      width: SLASH_OVERLAY.width,
      height: SLASH_OVERLAY.height,
      gap: 4,
      lockScroll: true,
    })
    return binding.destroy
  })

  onMount(() => {
    if (editor) {
      editor.destroy()
      editor = null
    }

    editor = new HtmdEditor({
      element,
      surfaceElement: surfaceEl,
      content,
      editable,
      clickToEdit,
      enforceTitle,
      editorClass: editorTypography,
      services,
      nodeViews,
      overlays,
      onOverlayChange: (overlay) => {
        activeOverlay = overlay
      },
      mentionSource,
      hrefBuilder,
      onUpload,
      fetchLinkPreview,
      onchange,
      onedit: () => {
        if (!onedit) return false
        const allowed = onedit()
        if (allowed) {
          whichKeyController?.setMode('insert')
        }
        return allowed
      },
      onexit: () => {
        onexit?.()
        whichKeyController?.setMode('normal')
      },
      mentionRender: () => ({
        onStart: (props) => {
          mentionMenuProps = props
          const rect = props.clientRect?.()
          if (rect) mentionMenuCoords = { left: rect.left, top: rect.bottom + 8 }
        },
        onUpdate: (props) => {
          mentionMenuProps = props
          const rect = props.clientRect?.()
          if (rect) mentionMenuCoords = { left: rect.left, top: rect.bottom + 8 }
        },
        onExit: () => {
          mentionMenuProps = null
        },
      }),
      slashRender: () => ({
        onStart: (props) => {
          slashMenuProps = props
        },
        onUpdate: (props) => {
          slashMenuProps = props
        },
        onExit: () => {
          slashMenuProps = null
        },
      }),
    })
  })

  onDestroy(() => {
    if (editor) {
      editor.destroy()
      editor = null
    }
  })

  $effect(() => {
    if (editor) {
      editor.setClickToEdit(clickToEdit)
      editor.setEditable(editable)
      if (editable) {
        if (whichKeyController && whichKeyController.getState().mode !== 'insert') {
          whichKeyController.setMode('insert')
        }
      } else {
        slashMenuProps = null
        mentionMenuProps = null
        if (whichKeyController && whichKeyController.getState().mode === 'insert') {
          whichKeyController.setMode('normal')
        }
      }
    }
  })

  // Methods -------------------------------------------------------------------
  function closeOverlay(name: string) {
    editor?.closeOverlay(name)
  }

  export function updateContent(newContent: JSONContent) {
    editor?.setDocument(newContent, { emitUpdate: false })
  }

  export function focus() {
    editor?.focus('start')
  }

  export function enterCompoundBlock(): boolean {
    if (!editor) return false
    const entered = editor.enterCompoundBlock()
    if (entered) {
      whichKeyController?.setMode('insert')
    }
    return entered
  }

  export function getCounts(): EditorCounts {
    if (!editor) {
      return { wordCount: 0, charCount: 0, pageCount: 0, readDuration: 0 }
    }
    return editor.getCounts()
  }
</script>

<div bind:this={surfaceEl} class={cn(editorSurface())}>
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
        class="fixed z-50"
        style="left: {mentionMenuCoords.left}px; top: {mentionMenuCoords.top}px;"
      >
        <MentionList
          items={mentionMenuProps.items || []}
          command={(item) => mentionMenuProps?.command?.(item as MentionItem)}
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
