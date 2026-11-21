<!-- libs/helical-svelte/src/editor/ImageFileUpload.svelte -->
<!-- Ark UI FileUpload dropzone used by ImageInput. Selection and upload remain separate so -->
<!-- Cancel/Upload can share one footer and the parent can display upload progress. -->
<script lang="ts">
  import type { ImageFileUploadProps } from './types'
  import {
    FileUploadRoot,
    FileUploadDropzone,
    FileUploadTrigger,
    FileUploadHiddenInput,
    FileUploadItemGroup,
    FileUploadItem,
    FileUploadItemPreview,
    FileUploadItemPreviewImage,
    FileUploadItemName,
    FileUploadItemSizeText,
    FileUploadItemDeleteTrigger,
    type FileUploadFileChangeDetails,
  } from '@ark-ui/svelte/file-upload'
  import { ImagePlus, Trash2, Upload } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let {
    file,
    onFileChange,
    disabled = false,
    accept = 'image/*',
    dropLabel = 'Drop an image here',
    buttonLabel = 'Choose image',
    removeLabel = 'Remove image',
  }: ImageFileUploadProps = $props()
</script>

<FileUploadRoot
  {accept}
  maxFiles={1}
  acceptedFiles={file ? [file] : []}
  {disabled}
  onFileChange={(details: FileUploadFileChangeDetails) =>
    onFileChange(details.acceptedFiles[0] ?? null)}
>
  <FileUploadDropzone
    class="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-5 text-center transition-colors data-[dragging]:border-primary data-[dragging]:bg-primary/5"
  >
    <ImagePlus size={24} class="text-muted-foreground" aria-hidden="true" />
    <div class="text-sm font-medium">{dropLabel}</div>
    <div class="text-xs text-muted-foreground">or</div>
    <FileUploadTrigger
      class="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
    >
      <Upload size={16} aria-hidden="true" />
      {buttonLabel}
    </FileUploadTrigger>
  </FileUploadDropzone>
  <FileUploadItemGroup class="mt-2">
    {#if file}
      <FileUploadItem
        {file}
        class="flex items-center gap-3 rounded-md border border-border bg-background p-2"
      >
        <FileUploadItemPreview type="image/*" class="size-12 shrink-0 overflow-hidden rounded">
          <FileUploadItemPreviewImage class="size-full object-cover" />
        </FileUploadItemPreview>
        <div class="min-w-0 flex-1">
          <FileUploadItemName class="truncate text-sm font-medium" />
          <FileUploadItemSizeText class="text-xs text-muted-foreground" />
        </div>
        <FileUploadItemDeleteTrigger
          class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={removeLabel}
        >
          <Trash2 size={16} />
        </FileUploadItemDeleteTrigger>
      </FileUploadItem>
    {/if}
  </FileUploadItemGroup>
  <FileUploadHiddenInput />
</FileUploadRoot>
