<script lang="ts">
  import {
    TreeView as ArkTreeView,
    createTreeCollection,
    useTreeView,
  } from '@ark-ui/svelte/tree-view'
  import { tick, untrack } from 'svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import TreeNodeView from './TreeNode.svelte'
  import type { TreeNode } from './types'

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
    getLabel = (node) => node.label,
    class: className = '',
  }: {
    refresh?: { path: string; version: number }
    pendingNode?: TreeNode
    parentValue?: string
    contextItems?: (
      node: TreeNode,
    ) => { value: string; label: string; shortcut?: string; destructive?: boolean }[]
    onaction?: (value: string, action: string) => void
    renameValue?: string
    onrename?: (value: string, name: string) => Promise<void>
    oncancel?: (value: string) => void
    getLabel?: (node: TreeNode) => string
    nodes: TreeNode[]
    selected?: string | null
    onselect?: (value: string) => void
    loadChildren?: (node: TreeNode) => Promise<TreeNode[]>
    label?: string
    class?: string
  } = $props()

  let renameErrors = $state<Record<string, string>>({})
  let attempts = $state<Record<string, string>>({})
  // Replace the cache so collections also update for branches created after mount.
  let loaded = $state.raw<Record<string, TreeNode[]>>({})
  let errors = $state<Record<string, string>>({})
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
  const id = $props.id()
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
          delete attempts[value]
        } catch (error) {
          renameErrors[value] = error instanceof Error ? error.message : String(error)
          attempts[value] = label
          await tick()
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
        tree().startRenaming(value)
      })
  })
</script>

<ArkTreeView.RootProvider
  value={tree}
  class={cn('helical-tree-view', className)}
  lazyMount
  unmountOnExit
>
  <ArkTreeView.Tree aria-label={label}>
    {#each collection.rootNode.children ?? [] as node, index (node.value)}
      <TreeNodeView
        {node}
        indexPath={[index]}
        {errors}
        {renameErrors}
        oncancel={(value) => {
          delete renameErrors[value]
          delete attempts[value]
          oncancel?.(value)
        }}
        {contextItems}
        {onaction}
      />
    {/each}
  </ArkTreeView.Tree>
</ArkTreeView.RootProvider>

<style>
  :global(.helical-tree-view [data-part='tree']),
  :global(.helical-tree-view [data-part='branch-content']) {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.helical-tree-view [data-part='branch']) {
    list-style: none;
  }
  :global(.helical-tree-view [data-part='branch-indicator']) {
    width: 10px;
    flex-shrink: 0;
    transition: transform 120ms;
  }
  :global(.helical-tree-view [data-part='branch-indicator'][data-state='open']) {
    transform: rotate(90deg);
  }
  :global(.helical-tree-view .helical-tree-row) {
    height: 24px;
    font-size: 12px;
    padding-block: 0;
    padding-inline-start: calc(10px + (var(--depth) - 1) * 16px);
    cursor: pointer;
  }
  :global(.helical-tree-view .helical-tree-row[data-selected]) {
    background: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
  :global(.helical-tree-view .tree-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.helical-tree-view .tree-message) {
    margin: 4px 12px;
    font-size: 11px;
    color: var(--muted-foreground);
  }
  :global(.helical-tree-view [data-part='node-rename-input']) {
    width: 100%;
    min-width: 0;
    height: 22px;
    padding: 0 3px;
    border: 1px solid var(--sidebar-ring);
    border-radius: 2px;
    background: var(--background);
    color: var(--foreground);
    font: inherit;
  }
  :global(.helical-tree-view [data-part='branch-content']) {
    position: relative;
  }
  :global(.helical-tree-view .tree-indent-guide) {
    position: absolute;
    pointer-events: none;
    top: 0;
    bottom: 0;
    left: calc(17px + (var(--depth) - 1) * 16px);
    border-left: 1px solid var(--sidebar-border, #e2e8f0);
  }
  :global(.helical-tree-view .tree-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
  }
</style>
