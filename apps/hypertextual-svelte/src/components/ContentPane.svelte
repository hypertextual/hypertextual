<script lang="ts">
  import { useOptionalPaneRegistration } from '@cloudvoyant/helical-svelte'
  import { FileViewer, HtmdEditor } from '@hypertextual/ui'
  import type { WorkspaceService } from '../services/workspaceService.svelte'
  import ContentFallback from './ContentFallback.svelte'

  // Props ---------------------------------------------------------------------
  interface ContentPaneProps {
    workspace: WorkspaceService
  }
  let { workspace }: ContentPaneProps = $props()

  // State ---------------------------------------------------------------------
  let mainEl = $state<HTMLElement | null>(null)
  const pane = useOptionalPaneRegistration(
    () => mainEl,
    () => ({
      paneId: 'article',
      paneTitle: 'Article',
      paneOrder: 2,
      defaultTitle: 'Article',
    }),
  )

  // Derived -------------------------------------------------------------------
  const editor = $derived(workspace.editor)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (typeof window === 'undefined') return
    const onFocus = () => editor.handleWindowFocus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  })
</script>

<main
  bind:this={mainEl}
  {...pane.dataAttributes}
  tabindex="-1"
  class="document-pane"
  aria-label="Article"
>
  {#if !editor.loading && !editor.openingError && !editor.unsupported && editor.filePreview && editor.selected}
    {#key editor.filePreview.path}
      <FileViewer
        standalone
        kind={editor.filePreview.kind}
        title={editor.filePreview.title}
        src={editor.filePreview.src}
        xml={editor.filePreview.xml}
        onopenexternal={() => void editor.openInDefaultApp()}
        onrefresh={() => void editor.refreshPreview()}
      />
    {/key}
  {:else if !editor.loading && !editor.openingError && !editor.unsupported && editor.document?.content && editor.selected}
    {#key editor.version}
      <HtmdEditor
        document={editor.document.content}
        editable={editor.editable && !workspace.blocked}
        clickToEdit={workspace.settings.clickToInsert}
        oneditablechange={(editable) => editor.setEditable(editable && !workspace.blocked)}
        class="article-scroll"
        contentClass="article-editor"
        onchange={(document) => editor.change(document)}
        onUpload={(file) => editor.upload(file)}
        services={workspace.editorServices}
      />
    {/key}
  {:else}
    <ContentFallback {editor} />
  {/if}
</main>
