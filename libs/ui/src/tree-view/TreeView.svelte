<script lang="ts">
  import type { TreeViewProps } from './types'
  import {
    TreeView as ArkTreeView,
    createTreeCollection,
    useTreeView,
  } from '@ark-ui/svelte/tree-view'
  import { tick, untrack } from 'svelte'
  import { cn, getDocumentWhichKeyController } from '@cloudvoyant/helical-ui'
  import TreeNodeView from './TreeNode.svelte'
  import type { TreeNode } from './types'
  import { treeViewRootBase, treeViewListBase } from './styles'

  // Props ---------------------------------------------------------------------
  let {
    nodes,
    renameValue,
    onrename,
    oncancel,
    onaction,
    contextItems,
    pendingNode,
    refresh,
    parentValue,
    selected = null,
    onselect,
    loadChildren,
    label = 'Files',
    icon,
    getLabel = (node) => node.label,
    class: className = '',
  }: TreeViewProps = $props()

  // State ---------------------------------------------------------------------
  let rootEl = $state<HTMLDivElement | null>(null)
  let renameErrors = $state<Record<string, string>>({})
  let attempts = $state<Record<string, string>>({})
  // Replace the cache so collections also update for branches created after mount.
  let loaded = $state.raw<Record<string, TreeNode[]>>({})
  let errors = $state<Record<string, string>>({})
  const id = $props.id()

  // Derived -------------------------------------------------------------------
  const collection = $derived(
    createTreeCollection<TreeNode>({
      rootNode: { value: '__root__', label, children: nodes.map(hydrate) },
      nodeToValue: (node) => node.value,
      nodeToString: (node) => node.label,
      nodeToChildrenCount: (node) => (node.branch ? (node.children?.length ?? 1) : undefined),
    }),
  )
  // Keep article selection controlled by the caller so failed draft flushes cannot
  // leave the tree pointing at a different article than the editor.
  const tree = useTreeView<TreeNode>(() => ({
    id,
    collection,
    selectedValue: selected ? [selected] : [],
    selectionMode: 'single',
    canRename: () => Boolean(onrename),

    onRenameComplete: ({ value, label }) => {
      if (!onrename) return
      void (async () => {
        try {
          await onrename(value, label)
          clearRename(value)
          getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('normal')
        } catch (error) {
          renameErrors[value] = error instanceof Error ? error.message : String(error)
          attempts[value] = label
          await tick()
          getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('insert')
          tree().startRenaming(value)
        }
      })()
    },
    loadChildren: loadChildren
      ? async ({ node }) => {
          delete errors[node.value]
          try {
            const children = await loadChildren(node)
            loaded = { ...loaded, [node.value]: children }
            return children
          } catch (error) {
            errors[node.value] = error instanceof Error ? error.message : String(error)
            throw error
          }
        }
      : undefined,
    onSelectionChange: ({ selectedValue }) => {
      const value = selectedValue[0]
      const node = value ? collection.findNode(value) : undefined
      if (node && !node.branch) onselect?.(node.value)
    },
  }))
  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const request = refresh
    if (request && loadChildren) {
      const node = untrack(() => collection.findNode(request.path))
      if (node)
        void loadChildren(node)
          .then(async (children) => {
            loaded = { ...loaded, [request.path]: children }
            await tick()
            tree().expand([request.path])
          })
          .catch((error) => {
            errors[request.path] = String(error)
          })
    }
  })
  $effect(() => {
    const value = renameValue
    const parent = parentValue
    if (value)
      void tick().then(() => {
        if (parent) tree().expand([parent])
        getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('insert')
        tree().startRenaming(value)
      })
  })
  $effect(() => {
    if (typeof window === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !rootEl?.contains(target)) return
      if (
        target.closest('[data-part="node-rename-input"]') ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }
      const itemEl = target.closest<HTMLElement>('[role="treeitem"][data-tree-node-value]')
      if (!itemEl) return
      const nodeValue = itemEl.dataset.treeNodeValue
      if (!nodeValue) return
      const isBranch = itemEl.dataset.treeNodeBranch === 'true'

      const controller = getDocumentWhichKeyController(rootEl.ownerDocument)
      if (
        (event.key === 'Home' || event.key === 'End') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const visible = tree()
          .getVisibleNodes()
          .map((v) => v.node)
        const dest = event.key === 'Home' ? visible[0]?.value : visible[visible.length - 1]?.value
        if (dest) {
          event.preventDefault()
          event.stopPropagation()
          tree().focus(dest)
        }
        return
      }
      if (controller) {
        const state = controller.getState()
        if (
          state.mode !== 'normal' ||
          state.activePath.length > 0 ||
          state.explorerOpen ||
          state.countBuffer.length > 0
        ) {
          return
        }
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (
        event.key === 'j' ||
        event.key === 'ArrowDown' ||
        event.key === 'k' ||
        event.key === 'ArrowUp'
      ) {
        const visible = tree()
          .getVisibleNodes()
          .map((v) => v.node)
        const idx = visible.findIndex((n) => n.value === nodeValue)
        if (idx !== -1) {
          const delta = event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1
          const next = visible[Math.max(0, Math.min(visible.length - 1, idx + delta))]
          event.preventDefault()
          event.stopPropagation()
          if (next) tree().focus(next.value)
        }
      } else if (event.key === 'l' || event.key === 'ArrowRight') {
        if (!isBranch) return
        event.preventDefault()
        event.stopPropagation()
        if (!tree().expandedValue.includes(nodeValue)) {
          tree().expand([nodeValue])
        } else {
          const visible = tree()
            .getVisibleNodes()
            .map((v) => v.node)
          const idx = visible.findIndex((n) => n.value === nodeValue)
          const child = visible[idx + 1]
          if (child && child.value.startsWith(`${nodeValue}/`)) {
            tree().focus(child.value)
          }
        }
      } else if (event.key === 'h' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        if (isBranch && tree().expandedValue.includes(nodeValue)) {
          tree().collapse([nodeValue])
        } else if (nodeValue.includes('/')) {
          const parent = nodeValue.slice(0, nodeValue.lastIndexOf('/'))
          tree().focus(parent)
        }
      } else if (event.key === 'Enter' && !isBranch) {
        event.preventDefault()
        event.stopPropagation()
        onselect?.(nodeValue)
      } else if (event.key === 'r' || event.key === 'F2') {
        if (!onrename) return
        event.preventDefault()
        event.stopPropagation()
        controller?.setMode('insert')
        tree().startRenaming(nodeValue)
      } else if (event.key === 'd' || event.key === 'Delete') {
        if (!onaction) return
        event.preventDefault()
        event.stopPropagation()
        onaction(nodeValue, 'delete')
      } else if (event.key === 'a') {
        if (!onaction) return
        event.preventDefault()
        event.stopPropagation()
        onaction(isBranch ? nodeValue : '', 'new-file')
      } else if (event.key === 'A') {
        if (!onaction) return
        event.preventDefault()
        event.stopPropagation()
        onaction(isBranch ? nodeValue : '', 'new-folder')
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  })

  // Methods -------------------------------------------------------------------
  function clearRename(value: string) {
    delete renameErrors[value]
    delete attempts[value]
  }
  function hydrate(node: TreeNode): TreeNode {
    const base = loaded[node.value] ?? node.children
    const children =
      pendingNode && parentValue === node.value ? [pendingNode, ...(base ?? [])] : base
    return {
      ...node,
      displayLabel: getLabel(node),
      label: attempts[node.value] ?? node.label,
      children: children?.map(hydrate),
    }
  }
</script>

<div bind:this={rootEl} class={cn(treeViewRootBase, className)}>
  <ArkTreeView.RootProvider
    value={tree}
    class={treeViewRootBase}
    lazyMount
    unmountOnExit
  >
    <ArkTreeView.Tree aria-label={label} class={treeViewListBase}>
      {#each collection.rootNode.children ?? [] as node, index (node.value)}
        <TreeNodeView
          {node}
          indexPath={[index]}
          {errors}
          {renameErrors}
          {icon}
          onedit={(value) => {
            delete renameErrors[value]
          }}
          oncancel={(value) => {
            clearRename(value)
            getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('normal')
            oncancel?.(value)
          }}
          {contextItems}
          {onaction}
        />
      {/each}
    </ArkTreeView.Tree>
  </ArkTreeView.RootProvider>
</div>
