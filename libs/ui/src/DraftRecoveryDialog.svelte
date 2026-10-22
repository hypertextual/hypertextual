<script lang="ts">
  import {
    Button,
    Dialog,
    DialogBackdrop,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@cloudvoyant/helical-svelte'
  let {
    open,
    message,
    copyStatus = '',
    onclose,
    oncopy,
    ondiscard,
    onretry,
    busy = false,
  }: {
    open: boolean
    message: string
    copyStatus?: string
    busy?: boolean
    onclose: () => void
    oncopy: () => void
    ondiscard: () => void
    onretry?: () => void
  } = $props()
</script>

<Dialog
  role="alertdialog"
  {open}
  onOpenChange={({ open }) => {
    if (!open) onclose()
  }}
>
  <DialogBackdrop />
  <DialogContent positionerClass="draft-recovery-positioner">
    <DialogHeader>
      <DialogTitle>Changes need attention</DialogTitle>
      <DialogDescription
        >{message
          .replace(/Remove it or copy your draft before leaving\./g, '')
          .replace(/Your draft is retained\./g, '')
          .trim()} Your draft is retained. Discard replaces it with the last saved version.</DialogDescription
      >
    </DialogHeader>
    {#if copyStatus}<p role="status">{copyStatus}</p>{/if}
    <DialogFooter>
      <Button variant="text" size="sm" onclick={onclose}>Keep editing</Button>
      <Button variant="text" size="sm" onclick={oncopy}>Copy draft</Button>
      {#if onretry}<Button variant="outline" size="sm" disabled={busy} onclick={onretry}
          >Retry autosave</Button
        >{/if}
      <Button variant="outline" size="sm" disabled={busy} onclick={ondiscard}
        >Discard draft and reload</Button
      >
    </DialogFooter>
  </DialogContent>
</Dialog>

<style>
  :global(.draft-recovery-positioner) {
    z-index: 150;
  }
</style>
