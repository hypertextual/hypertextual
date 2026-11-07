import type { HtmdEditor, HtmdNodeViewContext, NodeViewRenderer } from 'htmd-ts'
import { getAllContexts, mount, unmount, type Component } from 'svelte'
import { createSubscriber, SvelteMap } from 'svelte/reactivity'

export interface SvelteNodeViewProps<TEditor = HtmdEditor>
  extends HtmdNodeViewContext<TEditor> {
  readonly editable: boolean
  readonly subtextRange: { from: number; to: number } | null
}

export function createSvelteNodeView<
  TProps extends SvelteNodeViewProps<HtmdEditor> = SvelteNodeViewProps<HtmdEditor>,
>(
  component: Component<TProps>,
  options?: { as?: string; context?: Map<unknown, unknown> },
): NodeViewRenderer<HtmdEditor> {
  let capturedContext: Map<unknown, unknown> | undefined
  try {
    capturedContext = getAllContexts()
  } catch {
    capturedContext = undefined
  }

  return () => (ctx) => {
    const tag = options?.as ?? (ctx.node.isInline ? 'span' : 'div')
    const target = document.createElement(tag)
    const subscribe = createSubscriber((update) =>
      typeof ctx.editor?.subscribe === 'function' ? ctx.editor.subscribe(update) : () => {},
    )

    let currentNode = $state.raw(ctx.node)
    let currentDecorations = $state.raw(ctx.decorations)
    let currentInnerDecorations = $state.raw(ctx.innerDecorations)
    let currentSelected = $state(ctx.selected)

    const reactiveProps = {
      get editor() {
        return ctx.editor
      },
      get node() {
        return currentNode
      },
      get decorations() {
        return currentDecorations
      },
      get innerDecorations() {
        return currentInnerDecorations
      },
      get selected() {
        return currentSelected
      },
      get editable() {
        subscribe()
        return Boolean(ctx.editor?.isEditable && ctx.editor?.isInsertMode)
      },
      get subtextRange() {
        subscribe()
        const st = ctx.editor?.getSubtextCursor?.()
        const pos = typeof ctx.getPos === 'function' ? ctx.getPos() : undefined
        if (!st || st.pos !== pos) return null
        if (typeof st.anchorOffset === 'number') {
          const from = Math.min(st.anchorOffset, st.offset)
          const to = Math.max(st.anchorOffset, st.offset)
          return { from, to: Math.max(from + 1, to) }
        }
        return { from: st.offset, to: st.offset + 1 }
      },
      get HTMLAttributes() {
        return ctx.HTMLAttributes
      },
      getPos: ctx.getPos,
      updateAttributes: ctx.updateAttributes,
      deleteNode: ctx.deleteNode,
    } as unknown as TProps

    const context = options?.context ?? capturedContext ?? new SvelteMap()
    const mounted = mount(component, {
      target,
      props: reactiveProps,
      context,
    })

    return {
      dom: target,
      update(node, decorations, innerDecorations) {
        currentNode = node
        currentDecorations = decorations
        currentInnerDecorations = innerDecorations
        return true
      },
      selectNode() {
        currentSelected = true
      },
      deselectNode() {
        currentSelected = false
      },
      destroy() {
        void unmount(mounted)
      },
    }
  }
}

export const svelteNodeView = createSvelteNodeView
