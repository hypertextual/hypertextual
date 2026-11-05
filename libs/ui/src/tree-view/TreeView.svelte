<script lang="ts">
  import type { TreeViewProps } from './types'
  import {
    TreeView as ArkTreeView,
    createTreeCollection,
    useTreeView,
  } from '@ark-ui/svelte/tree-view'
  import { tick, untrack } from 'svelte'
  import { cn, getDocumentWhichKeyController } from '@cloudvoyant/helical-ui'
  import { useKeyScope } from '../key-scope/useKeyScope.svelte'
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
  function resolveTreeItemTarget(
    event: KeyboardEvent,
  ): { nodeValue: string; isBranch: boolean } | null {
    const target = event.target
    if (!(target instanceof HTMLElement) || !rootEl?.contains(target)) return null
    if (
      target.closest('[data-part="node-rename-input"]') ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    ) {
      return null
    }
    const itemEl = target.closest<HTMLElement>('[data-tree-node-value]')
    if (!itemEl) return null
    const nodeValue = itemEl.dataset.treeNodeValue
    if (!nodeValue) return null
    return {
      nodeValue,
      isBranch: itemEl.dataset.treeNodeBranch === 'true',
    }
  }

  function isNormalTreeReady(): boolean {
    if (!rootEl) return false
    const controller = getDocumentWhichKeyController(rootEl.ownerDocument)
    if (!controller) return true
    const state = controller.getState()
    return (
      state.mode === 'normal' &&
      state.activePath.length === 0 &&
      !state.explorerOpen &&
      state.countBuffer.length === 0
    )
  }

  function moveFocusDelta(nodeValue: string, delta: 1 | -1): boolean {
    const visible = tree()
      .getVisibleNodes()
      .map((v) => v.node)
    const idx = visible.findIndex((n) => n.value === nodeValue)
    if (idx === -1) return false
    const next = visible[Math.max(0, Math.min(visible.length - 1, idx + delta))]
    if (next) tree().focus(next.value)
    return true
  }

  function expandOrFocusChild(nodeValue: string, isBranch: boolean): boolean {
    if (!isBranch) return false
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
    return true
  }

  function collapseOrFocusParent(nodeValue: string, isBranch: boolean): boolean {
    if (isBranch && tree().expandedValue.includes(nodeValue)) {
      tree().collapse([nodeValue])
    } else if (nodeValue.includes('/')) {
      const parent = nodeValue.slice(0, nodeValue.lastIndexOf('/'))
      tree().focus(parent)
    }
    return true
  }

  useKeyScope({
    id: `pane:tree-view:${id}`,
    priority: 'pane',
    element: () => rootEl,
    enabled: () => Boolean(rootEl),
    getContext: () => null,
    keymap: {
      Home: {
        id: 'tree.first',
        key: 'Home',
        label: 'Focus First Item',
        run: (_ctx, event) => {
          if (!resolveTreeItemTarget(event)) return false
          const visible = tree()
            .getVisibleNodes()
            .map((v) => v.node)
          const dest = visible[0]?.value
          if (!dest) return false
          tree().focus(dest)
          return true
        },
      },
      End: {
        id: 'tree.last',
        key: 'End',
        label: 'Focus Last Item',
        run: (_ctx, event) => {
          if (!resolveTreeItemTarget(event)) return false
          const visible = tree()
            .getVisibleNodes()
            .map((v) => v.node)
          const dest = visible[visible.length - 1]?.value
          if (!dest) return false
          tree().focus(dest)
          return true
        },
      },
      j: {
        id: 'tree.nextJ',
        key: 'j',
        label: 'Next Item',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? moveFocusDelta(item.nodeValue, 1) : false
        },
      },
      ArrowDown: {
        id: 'tree.nextDown',
        key: 'ArrowDown',
        label: 'Next Item',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? moveFocusDelta(item.nodeValue, 1) : false
        },
      },
      k: {
        id: 'tree.prevK',
        key: 'k',
        label: 'Previous Item',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? moveFocusDelta(item.nodeValue, -1) : false
        },
      },
      ArrowUp: {
        id: 'tree.prevUp',
        key: 'ArrowUp',
        label: 'Previous Item',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? moveFocusDelta(item.nodeValue, -1) : false
        },
      },
      l: {
        id: 'tree.expandL',
        key: 'l',
        label: 'Expand Folder',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? expandOrFocusChild(item.nodeValue, item.isBranch) : false
        },
      },
      ArrowRight: {
        id: 'tree.expandRight',
        key: 'ArrowRight',
        label: 'Expand Folder',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? expandOrFocusChild(item.nodeValue, item.isBranch) : false
        },
      },
      h: {
        id: 'tree.collapseH',
        key: 'h',
        label: 'Collapse Folder',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? collapseOrFocusParent(item.nodeValue, item.isBranch) : false
        },
      },
      ArrowLeft: {
        id: 'tree.collapseLeft',
        key: 'ArrowLeft',
        label: 'Collapse Folder',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          return item ? collapseOrFocusParent(item.nodeValue, item.isBranch) : false
        },
      },
      Enter: {
        id: 'tree.open',
        key: 'Enter',
        label: 'Open Article',
        mode: 'normal',
        when: () => isNormalTreeReady(),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || item.isBranch) return false
          onselect?.(item.nodeValue)
          return true
        },
      },
      r: {
        id: 'tree.renameR',
        key: 'r',
        label: 'Rename Item',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onrename),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onrename) return false
          getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('insert')
          tree().startRenaming(item.nodeValue)
          return true
        },
      },
      F2: {
        id: 'tree.renameF2',
        key: 'F2',
        label: 'Rename Item',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onrename),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onrename) return false
          getDocumentWhichKeyController(rootEl?.ownerDocument)?.setMode('insert')
          tree().startRenaming(item.nodeValue)
          return true
        },
      },
      d: {
        id: 'tree.deleteD',
        key: 'd',
        label: 'Delete Item',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onaction),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onaction) return false
          onaction(item.nodeValue, 'delete')
          return true
        },
      },
      Delete: {
        id: 'tree.deleteKey',
        key: 'Delete',
        label: 'Delete Item',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onaction),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onaction) return false
          onaction(item.nodeValue, 'delete')
          return true
        },
      },
      a: {
        id: 'tree.newFile',
        key: 'a',
        label: 'New Article',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onaction),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onaction) return false
          onaction(item.isBranch ? item.nodeValue : '', 'new-file')
          return true
        },
      },
      A: {
        id: 'tree.newFolder',
        key: 'A',
        label: 'New Folder',
        mode: 'normal',
        when: () => isNormalTreeReady() && Boolean(onaction),
        run: (_ctx, event) => {
          const item = resolveTreeItemTarget(event)
          if (!item || !onaction) return false
          onaction(item.isBranch ? item.nodeValue : '', 'new-folder')
          return true
        },
      },
    },
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
