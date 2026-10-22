<script lang="ts">
  import { TreeView, type TreeNode } from '@hypertextual/ui'
  import type { WorkspaceClient, WorkspaceEntry } from '../lib/workspace'

  let {
    entries,
    client,
    selected,
    onselect,
    titles = {},
    pendingEntry = null,
    oncommit,
    oncancel,
    refreshFolder,
    pendingParent = '',
    onaction,
  }: {
    refreshFolder?: { path: string; version: number }
    pendingParent?: string
    onaction: (path: string, action: string) => void
    pendingEntry?: WorkspaceEntry | null
    oncommit: (path: string, name: string) => Promise<void>
    oncancel: () => void
    entries: WorkspaceEntry[]
    client: WorkspaceClient
    selected: string | null
    titles?: Record<string, string>
    onselect: (entry: WorkspaceEntry) => void
  } = $props()

  let listed = $state<Record<string, WorkspaceEntry>>({})
  const known = $derived({
    ...listed,
    ...Object.fromEntries(entries.map((entry) => [entry.path, entry])),
  })
  function toNode(entry: WorkspaceEntry): TreeNode {
    return {
      value: entry.path,
      label: entry.name,
      description: entry.kind === 'directory' ? undefined : entry.name,
      branch: entry.kind === 'directory',
    }
  }
</script>

<TreeView
  label="Workspace files"
  nodes={[
    ...(pendingEntry && !pendingParent ? [toNode(pendingEntry)] : []),
    ...entries.map(toNode),
  ]}
  renameValue={pendingEntry?.path}
  pendingNode={pendingEntry ? toNode(pendingEntry) : undefined}
  parentValue={pendingParent}
  refresh={refreshFolder}
  {onaction}
  contextItems={(node) => [
    ...(node.branch
      ? [
          { value: 'new-file', label: 'New article' },
          { value: 'new-folder', label: 'New folder' },
        ]
      : []),
    { value: 'rename', label: 'Rename', shortcut: 'F2' },
    { value: 'delete', label: 'Move to Trash', destructive: true },
  ]}
  onrename={oncommit}
  oncancel={(value) => {
    if (value === pendingEntry?.path) oncancel()
  }}
  getLabel={(node) => titles[node.value] ?? node.label}
  {selected}
  onselect={(path) => {
    const entry = known[path]
    if (entry) onselect(entry)
  }}
  loadChildren={async (node) => {
    if (node.value === pendingEntry?.path) return []
    const children = await client.list(node.value)
    for (const entry of children) listed[entry.path] = entry
    return children.map(toNode)
  }}
/>
