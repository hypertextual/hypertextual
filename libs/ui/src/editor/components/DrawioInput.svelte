<script lang="ts">
  import { onDestroy } from 'svelte'
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import type { ImageUploadResult } from 'htmd-ts'
  import { X } from 'lucide-svelte'
  import ImageFileUpload from './ImageFileUpload.svelte'
  import type { ImageInputProps } from './types'

  // Props ---------------------------------------------------------------------
  let { editor, position, data, onClose, onUpload }: ImageInputProps = $props()

  // State ---------------------------------------------------------------------
  const replaceData = $derived(
    data && typeof data === 'object' ? (data as { replace?: boolean; src?: string }) : undefined,
  )
  let active = true
  let dialogElement = $state<HTMLDivElement | null>(null)
  let selectedFile = $state<File | null>(null)
  let uploading = $state(false)
  let uploadError = $state('')

  // Lifecycle -----------------------------------------------------------------
  onDestroy(() => {
    active = false
  })

  useKeymap(
    {
      Escape: {
        key: 'Escape',
        label: 'Close Draw.io Upload Dialog',
        hidden: true,
        action: () => {
          onClose()
          editor.execCommand('exitToNormal')
          return true
        },
      },
    },
    {
      priority: 'overlay',
      element: () => dialogElement,
      enabled: () => Boolean(dialogElement),
    },
  )

  // Methods -------------------------------------------------------------------
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('No diagram data'))
      reader.onerror = () => reject(reader.error ?? new Error('Could not read diagram'))
      reader.readAsDataURL(file)
    })
  }

  async function handleUpload() {
    if (!selectedFile) {
      uploadError = 'Choose a Draw.io file first.'
      return
    }

    uploading = true
    uploadError = ''
    try {
      const result: ImageUploadResult = onUpload
        ? await onUpload(selectedFile)
        : editor.services.media
          ? await editor.services.media
              .write(selectedFile)
              .then((asset) => ({ src: asset.url, srcset: asset.srcset }))
          : { src: await fileToDataUrl(selectedFile) }
      if (!active) return
      editor.insertOrReplaceDrawio(
        position,
        { src: result.src, alt: selectedFile.name.replace(/\.drawio(?:\.(?:svg|png))?$/i, '') },
        Boolean(replaceData?.replace),
      )
      onClose()
    } catch {
      if (active) uploadError = 'Upload failed. Choose a .drawio, .drawio.svg, or .drawio.png file.'
    } finally {
      if (active) uploading = false
    }
  }
</script>

<div
  bind:this={dialogElement}
  class="max-h-[calc(100vh-2rem)] w-80 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
  role="dialog"
  aria-label={replaceData?.replace ? 'Replace Draw.io diagram' : 'Insert Draw.io diagram'}
  tabindex="-1"
>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">
        {replaceData?.replace ? 'Replace Draw.io Diagram' : 'Insert Draw.io Diagram'}
      </p>
      <button
        type="button"
        onclick={onClose}
        class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Close Draw.io dialog"
      >
        <X size={16} />
      </button>
    </div>

    <div class="space-y-1">
      <ImageFileUpload
        file={selectedFile}
        disabled={uploading}
        accept=".drawio,.drawio.svg,.drawio.png,image/svg+xml,image/png"
        dropLabel="Drop a Draw.io file here"
        buttonLabel="Choose Draw.io file"
        removeLabel="Remove selected file"
        onFileChange={(file) => {
          selectedFile = file
          uploadError = ''
        }}
      />
      {#if uploading}
        <p class="text-xs text-muted-foreground">Uploading…</p>
      {/if}
      {#if uploadError}
        <div role="alert" class="text-xs leading-tight text-destructive">{uploadError}</div>
      {/if}
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        onclick={onClose}
        class="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={() => void handleUpload()}
        disabled={uploading || !selectedFile}
        class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : replaceData?.replace ? 'Replace' : 'Upload'}
      </button>
    </div>
  </div>
</div>
