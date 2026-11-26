<script lang="ts">
  import { Button } from '@cloudvoyant/helical-svelte'
  import { FolderOpen } from 'lucide-svelte'
  import { errorMessage } from '../clients/workspaceClient'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface AddWorkspaceDialogProps {
    workspace: WorkspaceService
  }
  let { workspace }: AddWorkspaceDialogProps = $props()

  // State ---------------------------------------------------------------------
  let workspaceName = $state('')
  let duplicateHint = $state(false)
  let submitting = $state(false)
  let submitError = $state<string | null>(null)
  let nameInput = $state<HTMLInputElement | null>(null)

  // Derived -------------------------------------------------------------------
  const folderPath = $derived(workspace.pendingWorkspacePath ?? '')
  const open = $derived(workspace.pendingWorkspacePath !== null)
  const nameTaken = $derived(workspace.hasWorkspaceName(workspaceName))
  const canSubmit = $derived(
    !submitting && Boolean(folderPath) && Boolean(workspaceName.trim()) && !nameTaken,
  )

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const picked = workspace.pendingWorkspacePath
    if (picked) {
      const suggested = workspace.defaultNameForPath(picked)
      workspaceName = suggested
      duplicateHint = suggested === ''
      submitting = false
      submitError = null
      queueMicrotask(() => {
        nameInput?.focus()
        nameInput?.select()
      })
    } else {
      workspaceName = ''
      duplicateHint = false
      submitting = false
      submitError = null
    }
  })

  // Methods -------------------------------------------------------------------
  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!canSubmit) return
    submitting = true
    submitError = null
    try {
      await workspace.openWorkspaceFolder(folderPath, workspaceName.trim())
    } catch (error) {
      submitError = errorMessage(error)
    } finally {
      submitting = false
    }
  }

  function handleClose(): void {
    if (submitting) return
    workspace.closeAddWorkspaceDialog()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.preventDefault()
      handleClose()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-xs"
    role="dialog"
    aria-modal="true"
    aria-label="Create workspace"
  >
    <form
      class="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      onsubmit={handleSubmit}
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-sm font-semibold text-foreground">Create workspace</h2>
        <p
          class="flex items-center gap-1.5 truncate text-xs text-muted-foreground"
          title={folderPath}
        >
          <FolderOpen size={12} strokeWidth={1.5} class="shrink-0" />
          <span class="truncate">{folderPath}</span>
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="workspace-name-input" class="text-xs font-medium text-foreground"
          >Workspace name</label
        >
        <input
          bind:this={nameInput}
          id="workspace-name-input"
          type="text"
          aria-label="Workspace name"
          class="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none"
          placeholder="Enter a unique workspace name"
          bind:value={workspaceName}
        />
        {#if duplicateHint && !workspaceName.trim()}
          <p class="text-xs text-muted-foreground" role="status">
            A workspace with that folder name already exists. Enter a unique name.
          </p>
        {:else if nameTaken}
          <p class="text-xs text-destructive" role="alert">
            A workspace with this name already exists.
          </p>
        {/if}
      </div>

      {#if submitError}
        <p class="text-xs text-destructive" role="alert">{submitError}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-1">
        <Button type="button" variant="text" size="sm" disabled={submitting} onclick={handleClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>Create workspace</Button>
      </div>
    </form>
  </div>
{/if}
