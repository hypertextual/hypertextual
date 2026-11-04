<script lang="ts">
  import { editorSurface, editorTypography } from './styles'
  import { cn, registerModalEditor } from '@cloudvoyant/helical-ui'
  import { useOptionalWhichKeyController } from '@cloudvoyant/helical-svelte'
  import type { EditorProps, EditorOverlayViewProps } from './types'
  import { onMount, onDestroy, tick, type Component } from 'svelte'
  import { Editor, type EditorOptions } from '@tiptap/core'
  import { NodeSelection } from '@tiptap/pm/state'
  import { SvelteNodeViewRenderer } from 'svelte-tiptap'
  import {
    buildExtensions,
    getEditorModalTarget,
    modalKeymapPluginKey,
    type ModalKeymapStorage,
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
    clickToEdit = true,
    onedit,
    onexit,
    enforceTitle = true,
    onchange,
    mentionSource,
    hrefBuilder,
    onUpload,
    fetchLinkPreview,
  }: EditorProps = $props()

  // State ---------------------------------------------------------------------
  const whichKeyController = useOptionalWhichKeyController()

  let editor = $state<Editor | null>(null)

  let surfaceEl: HTMLDivElement

  let element: HTMLDivElement

  let modalDomCleanups: (() => void)[] = []

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
      image: () => SvelteNodeViewRenderer(ImageNodeView),
      urlMention: () => SvelteNodeViewRenderer(UrlMentionPill),
      linkPreview: () => SvelteNodeViewRenderer(LinkPreviewCard),
      codeBlock: () => SvelteNodeViewRenderer(CodeBlockComponent),
      notice: () => SvelteNodeViewRenderer(NoticeNodeView),
    }

    editor = new Editor({
      element,
      ...({ immediatelyRender: false } as unknown as Partial<EditorOptions>),
      extensions: buildExtensions({
        mentionSource,
        hrefBuilder,
        fetchLinkPreview,
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
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) onchange?.(editor.getJSON())
      },
      editorProps: {
        handleClick(view, position, event) {
          if (view.editable || !onedit) return false
          const target = event.target
          const bookmarkEdit =
            target instanceof Element ? target.closest<HTMLElement>('[data-bookmark-edit]') : null
          if (
            target instanceof Element &&
            !bookmarkEdit &&
            target.closest(
              'a, button, input, select, summary, iframe, [role="button"], [role="combobox"], [data-modal-ignore-pointer]',
            )
          )
            return false
          if (!clickToEdit) {
            let compoundPos: number | null = null
            if (target instanceof Element) {
              view.state.doc.descendants((node, pos) => {
                if (
                  node.type.name === 'notice' ||
                  node.type.name === 'codeBlock' ||
                  node.type.name === 'image' ||
                  node.type.name === 'imageNode' ||
                  node.type.name === 'linkPreview'
                ) {
                  const nodeDom = view.nodeDOM(pos)
                  if (nodeDom instanceof HTMLElement && nodeDom.contains(target)) {
                    compoundPos = pos
                  }
                  return false
                }
                return true
              })
            }
            if (compoundPos !== null) {
              const node = view.state.doc.nodeAt(compoundPos)
              if (node && NodeSelection.isSelectable(node)) {
                view.dispatch(
                  view.state.tr.setSelection(NodeSelection.create(view.state.doc, compoundPos)),
                )
              }
            } else {
              editor?.commands.setTextSelection(position)
            }
            const region = surfaceEl?.closest<HTMLElement>('[role="region"]') ?? surfaceEl
            region?.focus({ preventScroll: true })
            return true
          }
          if (!onedit()) return false
          // Enable before ProseMirror places the caret for this click.
          editor?.setEditable(true)
          if (editor) {
            try {
              editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
            } catch {
              // Ignore
            }
            getEditorModalTarget(editor)?.setModalState({
              mode: 'insert',
              preset: whichKeyController?.getState().preset ?? 'helix',
            })
          }
          whichKeyController?.setMode('insert')
          if (bookmarkEdit) {
            void tick().then(() => bookmarkEdit.click())
            return true
          }
          editor?.commands.setTextSelection(position)
          view.focus()
          return true
        },
        attributes: {
          class: editorTypography,
        },
      },
    })

    const target = getEditorModalTarget(editor)
    if (target) {
      target.setModalState({
        mode: editable ? 'insert' : 'normal',
        preset: whichKeyController?.getState().preset ?? 'helix',
      })
      if (surfaceEl) {
        modalDomCleanups.push(registerModalEditor(surfaceEl, target))
        const region = surfaceEl.closest('[role="region"]')
        if (region instanceof HTMLElement) {
          modalDomCleanups.push(registerModalEditor(region, target))
        }
      }
    }

    editor.on('transaction', syncModalEditableState)
  })

  onDestroy(() => {
    for (const cleanup of modalDomCleanups) cleanup()
    modalDomCleanups = []
    if (editor) {
      editor.off('transaction', syncModalEditableState)
      editor.destroy()
    }
  })

  // Update editable state
  $effect(() => {
    if (editor) {
      const storage = (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage })
        .modalKeymap
      if (storage) {
        storage.clickToInsert = clickToEdit
      }
      const editableChanged = editor.isEditable !== editable
      editor.setEditable(editable)
      if (editableChanged) {
        try {
          editor.view.dispatch(editor.state.tr.setMeta('editableChanged', editable))
        } catch {
          // Ignore if view is not yet mounted
        }
      }
      const target = getEditorModalTarget(editor)
      const currentMode = modalKeymapPluginKey.getState(editor.state)?.mode ?? 'insert'
      const preset = whichKeyController?.getState().preset ?? 'helix'
      if (editable) {
        if (currentMode !== 'insert') {
          target?.setModalState({ mode: 'insert', preset })
        }
        if (whichKeyController && whichKeyController.getState().mode !== 'insert') {
          whichKeyController.setMode('insert')
        }
        const sel = editor.state.selection
        if (storage?.focusControlRequest) {
          const req = storage.focusControlRequest
          storage.focusControlRequest = null
          focusCompoundBlockControl(req.pos, req.type, req.control)
        } else if (
          sel instanceof NodeSelection &&
          (sel.node.type.name === 'image' ||
            sel.node.type.name === 'imageNode' ||
            sel.node.type.name === 'linkPreview')
        ) {
          focusCompoundBlockControl(sel.from, sel.node.type.name)
        }
      } else {
        if (activeOverlay) editor.commands.closeOverlay(activeOverlay.name)
        slashMenuProps = null
        mentionMenuProps = null
        if (currentMode === 'insert') {
          target?.setModalState({ mode: 'normal', preset })
        }
        if (whichKeyController && whichKeyController.getState().mode === 'insert') {
          whichKeyController.setMode('normal')
        }
      }
    }
  })

  // Methods -------------------------------------------------------------------
  function focusCompoundBlockControl(
    pos: number,
    type: string,
    control?: string,
    offset?: number,
  ) {
    void tick().then(() => {
      if (!editor) return
      const dom = editor.view.nodeDOM(pos)
      if (!(dom instanceof HTMLElement)) return
      if (type === 'notice') {
        if (control === 'type') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Notice type"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return
          }
        }
        const input = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
        }
      } else if (type === 'codeBlock') {
        if (control === 'language') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return
          }
        }
        editor.commands.setTextSelection(pos + 1)
        editor.view.focus()
      } else if (type === 'image' || type === 'imageNode') {
        const input = dom.querySelector<HTMLInputElement>(
          'input.caption-input, input[aria-label="Image caption"]',
        )
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
        }
      } else if (type === 'linkPreview') {
        if (control === 'dialog') {
          const bookmarkEdit = dom.querySelector<HTMLElement>('[data-bookmark-edit]')
          if (bookmarkEdit) {
            bookmarkEdit.click()
            return
          }
        }
        const input = dom.querySelector<HTMLInputElement>(
          'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]',
        )
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
          return
        }
        const action = dom.querySelector<HTMLElement>(
          'button[aria-label="Play video"], a.bookmark-card-edit, button[aria-label="Remove preview"]',
        )
        action?.focus()
      }
    })
  }

  function syncModalEditableState() {
    if (!editor) return
    if (whichKeyController?.getState().explorerOpen) return
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (
      active &&
      surfaceEl &&
      !surfaceEl.contains(active) &&
      !active.contains(surfaceEl) &&
      active.closest('[data-pane-id], [data-which-key-explorer], [data-part="node-rename-input"]')
    ) {
      return
    }
    const pluginState = modalKeymapPluginKey.getState(editor.state)
    if (!pluginState) return
    if (pluginState.mode === 'insert' && !editor.isEditable) {
      if (!onedit || onedit()) {
        editor.setEditable(true)
        try {
          editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
        } catch {
          // Ignore
        }
        const storage = (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage })
          .modalKeymap
        const sel = editor.state.selection
        if (storage?.focusControlRequest) {
          const req = storage.focusControlRequest
          storage.focusControlRequest = null
          focusCompoundBlockControl(req.pos, req.type, req.control, req.offset)
        } else if (
          sel instanceof NodeSelection &&
          (sel.node.type.name === 'image' ||
            sel.node.type.name === 'imageNode' ||
            sel.node.type.name === 'linkPreview')
        ) {
          focusCompoundBlockControl(sel.from, sel.node.type.name)
        } else {
          editor.view.focus()
        }
      }
    } else if (pluginState.mode !== 'insert' && editor.isEditable) {
      onexit?.()
      editor.setEditable(false)
      try {
        editor.view.dispatch(editor.state.tr.setMeta('editableChanged', false))
      } catch {
        // Ignore
      }
    }
  }

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

  // Enter the interior controls of a whole-block highlighted compound block
  export function enterCompoundBlock(): boolean {
    if (!editor || editor.isEditable) return false
    const sel = editor.state.selection
    const pluginState = modalKeymapPluginKey.getState(editor.state)
    let blockPos: number | null = null
    let blockType: string | null = null
    let control: string | undefined
    let offset: number | undefined
    if (pluginState?.subtextCursor) {
      blockPos = pluginState.subtextCursor.pos
      offset = pluginState.subtextCursor.offset
      if (pluginState.subtextCursor.kind === 'noticeTitle') {
        blockType = 'notice'
        control = 'type'
      } else if (pluginState.subtextCursor.kind === 'linkPreviewUrl') {
        blockType = 'linkPreview'
        control = 'url'
      } else {
        blockType = 'image'
        control = 'caption'
      }
    } else if (
      sel instanceof NodeSelection &&
      (sel.node.type.name === 'notice' ||
        sel.node.type.name === 'codeBlock' ||
        sel.node.type.name === 'image' ||
        sel.node.type.name === 'imageNode' ||
        sel.node.type.name === 'linkPreview')
    ) {
      blockPos = sel.from
      blockType = sel.node.type.name
      if (blockType === 'codeBlock') control = 'language'
    } else {
      const resolvedFrom = sel.$from
      for (let d = resolvedFrom.depth; d >= 1; d -= 1) {
        const name = resolvedFrom.node(d).type.name
        if (name === 'notice') {
          blockPos = resolvedFrom.before(d)
          blockType = 'notice'
          control = 'type'
          break
        }
        if (name === 'codeBlock') {
          blockPos = resolvedFrom.before(d)
          blockType = 'codeBlock'
          control = 'language'
          break
        }
      }
    }
    if (blockPos === null || !blockType) return false
    if (onedit && !onedit()) return false

    const storage = (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage }).modalKeymap
    if (storage) {
      storage.activeCompoundBlockPos = blockPos
    }
    editor.setEditable(true)
    const preset = whichKeyController?.getState().preset ?? 'helix'
    getEditorModalTarget(editor)?.setModalState({ mode: 'insert', preset })
    whichKeyController?.setMode('insert')
    try {
      editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
    } catch {
      // Ignore
    }

    focusCompoundBlockControl(blockPos, blockType, control, offset)
    return true
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
