<script lang="ts">
  import { Folder, FolderOpen, FileText, Image } from 'lucide-svelte'
  import ContextMenu from '../ContextMenu.svelte'
  import { TreeView as ArkTreeView, useTreeViewContext } from '@ark-ui/svelte/tree-view'
  import { cn, sidebarMenuButtonVariants } from '@cloudvoyant/helical-ui'
  import TreeNodeView from './TreeNode.svelte'
  import type { TreeNode } from './types'
  let {
    node,
    indexPath,
    errors,
    renameErrors,
    onedit,
    oncancel,
    contextItems,
    onaction,
  }: {
    node: TreeNode
    indexPath: number[]
    errors: Record<string, string>
    renameErrors: Record<string, string>
    onedit?: (value: string) => void
    contextItems?: (
      node: TreeNode,
    ) => { value: string; label: string; shortcut?: string; destructive?: boolean }[]
    onaction?: (value: string, action: string) => void
    oncancel?: (value: string) => void
  } = $props()
  const tree = useTreeViewContext()
  const id = $props.id()
  const renameErrorId = `${id}-rename-error`
  function action(value: string) {
    // Let Ark close the menu and restore focus before starting another interaction.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (value === 'rename') tree().startRenaming(node.value)
        else onaction?.(node.value, value)
      }),
    )
  }
  const rowClass = cn(sidebarMenuButtonVariants({ size: 'sm' }), 'helical-tree-row')
</script>

{#snippet icon(folder: boolean, expanded = false)}
  <span class="tree-icon" aria-hidden="true">
    {#if folder}{#if expanded}<FolderOpen size={13} strokeWidth={1.5} />{:else}<Folder
          size={13}
          strokeWidth={1.5}
        />{/if}
    {:else if /\.(png|jpe?g|gif|webp)$/i.test(node.label)}<Image size={13} strokeWidth={1.5} />
    {:else}<FileText size={13} strokeWidth={1.5} />{/if}
  </span>
{/snippet}

<ArkTreeView.NodeProvider {node} {indexPath}>
  <ArkTreeView.NodeContext>
    {#snippet render(state)}
      {#if node.branch}
        <ArkTreeView.Branch aria-label={node.displayLabel ?? node.label}>
          <ContextMenu items={contextItems?.(node) ?? []} onaction={action}>
            {#snippet children(triggerProps)}
              <ArkTreeView.BranchControl
                {...triggerProps}
                class={rowClass}
                title={node.description ?? node.value}
              >
                {@render icon(true, state().expanded)}
                <ArkTreeView.BranchText class="tree-label" hidden={state().renaming}
                  >{node.displayLabel ?? node.label}</ArkTreeView.BranchText
                >
                <ArkTreeView.NodeRenameInput
                  aria-label="Name"
                  aria-invalid={Boolean(renameErrors[node.value])}
                  data-invalid={renameErrors[node.value] ? '' : undefined}
                  aria-describedby={renameErrors[node.value] ? renameErrorId : undefined}
                  oninput={() => onedit?.(node.value)}
                  onkeydown={(event) => {
                    if (event.key === 'Escape') oncancel?.(node.value)
                  }}
                />
              </ArkTreeView.BranchControl>
            {/snippet}
          </ContextMenu>
          {#if errors[node.value]}<p class="tree-message" role="alert">
              {errors[node.value]} Expand the folder to retry.
            </p>{/if}
          <ArkTreeView.BranchContent>
            <ArkTreeView.BranchIndentGuide class="tree-indent-guide" />
            {#each node.children ?? [] as child, index (child.value)}
              <TreeNodeView
                node={child}
                indexPath={[...indexPath, index]}
                {errors}
                {renameErrors}
                {onedit}
                {oncancel}
                {contextItems}
                {onaction}
              />
            {/each}
          </ArkTreeView.BranchContent>
        </ArkTreeView.Branch>
      {:else}
        <ContextMenu items={contextItems?.(node) ?? []} onaction={action}>
          {#snippet children(triggerProps)}
            <ArkTreeView.Item
              {...triggerProps}
              class={rowClass}
              aria-label={node.description
                ? `${node.displayLabel ?? node.label} (${node.description})`
                : (node.displayLabel ?? node.label)}
              title={node.value}
            >
              {@render icon(false)}
              <ArkTreeView.ItemText class="tree-label" hidden={state().renaming}
                >{node.displayLabel ?? node.label}</ArkTreeView.ItemText
              >
              <ArkTreeView.NodeRenameInput
                aria-label="Name"
                aria-invalid={Boolean(renameErrors[node.value])}
                data-invalid={renameErrors[node.value] ? '' : undefined}
                aria-describedby={renameErrors[node.value] ? renameErrorId : undefined}
                oninput={() => onedit?.(node.value)}
                onkeydown={(event) => {
                  if (event.key === 'Escape') oncancel?.(node.value)
                }}
              />
            </ArkTreeView.Item>
          {/snippet}
        </ContextMenu>
      {/if}
      {#if renameErrors[node.value]}<p
          id={renameErrorId}
          class="tree-message tree-rename-error"
          role="alert"
        >
          {renameErrors[node.value]}
        </p>{/if}
    {/snippet}
  </ArkTreeView.NodeContext>
</ArkTreeView.NodeProvider>
