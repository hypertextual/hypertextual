<script lang="ts">
  import { Button } from '@cloudvoyant/helical-svelte'
  import { AlertTriangle, FolderSearch, Trash2 } from 'lucide-svelte'
  import type { WorkspaceRecord } from '../clients/workspaceClient'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface MissingWorkspaceBannerProps {
    workspace: WorkspaceService
    record: WorkspaceRecord
  }
  let { workspace, record }: MissingWorkspaceBannerProps = $props()

  // Derived -------------------------------------------------------------------
  const missingPath = $derived(
    record.backing.kind === 'remote' ? '' : record.backing.path,
  )

  // Methods -------------------------------------------------------------------
  async function handleRelocate(): Promise<void> {
    const picked = await workspace.pickFolder(`Relocate workspace "${record.name}"`)
    if (picked) await workspace.relocateMissingWorkspace(picked)
  }

  function handleRemove(): void {
    void workspace.removeWorkspace(record.name)
  }
</script>

<section
  class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
  role="alert"
  aria-label="Missing workspace"
>
  <AlertTriangle size={24} strokeWidth={1.5} class="text-muted-foreground" />
  <div class="flex max-w-md flex-col gap-1">
    <h2 class="text-sm font-semibold text-foreground">
      Workspace "{record.name}" could not be found
    </h2>
    {#if missingPath}
      <p class="break-all text-xs text-muted-foreground">{missingPath}</p>
    {/if}
    <p class="text-xs text-muted-foreground">
      The folder may have been moved or deleted. Relocate it to keep your workspace state, or remove
      it from the list.
    </p>
  </div>
  <div class="flex items-center gap-2 pt-1">
    <Button size="sm" variant="outline" onclick={() => void handleRelocate()}>
      <FolderSearch size={13} strokeWidth={1.5} />
      <span>Relocate folder…</span>
    </Button>
    <Button size="sm" variant="text" onclick={handleRemove}>
      <Trash2 size={13} strokeWidth={1.5} />
      <span>Remove from list</span>
    </Button>
  </div>
</section>
