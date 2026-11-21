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
  let folderPath = $state('')
  let workspaceName = $state('')
  let duplicateHint = $state(false)
  let submitting = $state(false)
  let submitError = $state<string | null>(null)

  // Derived -------------------------------------------------------------------
  const open = $derived(workspace.addDialogMode !== null)
  const isCreate = $derived(workspace.addDialogMode === 'create')
  const title = $derived(isCreate ? 'New workspace' : 'Open folder as workspace')
  const nameTaken = $derived(workspace.hasWorkspaceName(workspaceName))
  const canSubmit = $derived(
    !submitting && Boolean(folderPath.trim()) && Boolean(workspaceName.trim()) && !nameTaken,
  )

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (!open) {
      folderPath = ''
      workspaceName = ''
      duplicateHint = false
      submitting = false
      submitError = null
    }
  })

  // Methods -------------------------------------------------------------------
  async function handlePickFolder(): Promise<void> {
    submitError = null
    try {
      const picked = await workspace.pickFolder(
        isCreate ? 'Choose folder for new workspace' : 'Choose existing folder',
      )
      if (!picked) return
      folderPath = picked
      const suggested = workspace.defaultNameForPath(picked)
      workspaceName = suggested
      duplicateHint = suggested === ''
    } catch (error) {
      submitError = errorMessage(error)
    }
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!canSubmit) return
    submitting = true
    submitError = null
    try {
      if (isCreate) {
        await workspace.createWorkspace(folderPath.trim(), workspaceName.trim())
      } else {
        await workspace.openWorkspaceFolder(folderPath.trim(), workspaceName.trim())
      }
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
    aria-label={title}
  >
    <form
      class="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      onsubmit={handleSubmit}
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-sm font-semibold text-foreground">{title}</h2>
        <p class="text-xs text-muted-foreground">
          {isCreate
            ? 'Choose a folder location and name. No hidden marker files are added to the folder.'
            : 'Open any folder on disk as a workspace without modifying or tainting its contents.'}
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">Folder</span>
        <div class="flex items-center gap-2">
          <input
            type="text"
            aria-label="Workspace folder path"
            class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none"
            placeholder="/path/to/folder"
            bind:value={folderPath}
          />
          <Button type="button" variant="outline" size="sm" onclick={() => void handlePickFolder()}>
            <FolderOpen size={13} strokeWidth={1.5} />
            <span>Choose…</span>
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="workspace-name-input" class="text-xs font-medium text-foreground"
          >Workspace name</label
        >
        <input
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
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isCreate ? 'Create workspace' : 'Open workspace'}
        </Button>
      </div>
    </form>
  </div>
{/if}
