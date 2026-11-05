import type { HtmdEditor, HtmdNodeViewContext, HtmdNodeViewFactory } from 'htmd-ts'
import { getAllContexts, mount, unmount, type Component } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'

export function createSvelteNodeView<
  TProps extends HtmdNodeViewContext<HtmdEditor> = HtmdNodeViewContext<HtmdEditor>,
>(
  component: Component<TProps>,
  options?: { as?: string; context?: Map<unknown, unknown> },
): HtmdNodeViewFactory<HtmdEditor> {
  let capturedContext: Map<unknown, unknown> | undefined
  try {
    capturedContext = getAllContexts()
  } catch {
    capturedContext = undefined
  }

  return () => (ctx) => {
    const tag = options?.as ?? (ctx.node.isInline ? 'span' : 'div')
    const target = document.createElement(tag)

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
