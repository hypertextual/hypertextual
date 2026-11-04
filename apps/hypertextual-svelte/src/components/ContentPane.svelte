<script lang="ts">
  import { WhichKeyMode, useOptionalPaneRegistration } from '@cloudvoyant/helical-svelte'
  import { Breadcrumb, DocumentEditor } from '@hypertextual/ui'
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
  const crumbs = $derived(
    editor.selected
      ? [
          'Local workspace',
          ...editor.selected.path.split('/').slice(0, -1),
          workspace.selectedTitle,
        ]
      : ['Local workspace'],
  )
</script>

<main
  bind:this={mainEl}
  {...pane.dataAttributes}
  tabindex="-1"
  class="document-pane"
  aria-label="Article"
>
  {#if !editor.loading && !editor.openingError && !editor.unsupported && !editor.image && editor.document?.content && editor.selected}
    {#key editor.version}
      <DocumentEditor
        document={editor.document.content}
        editable={editor.editable && !workspace.blocked}
        clickToEdit={workspace.settings.clickToInsert}
        oneditablechange={(editable) => editor.setEditable(editable && !workspace.blocked)}
        class="article-scroll"
        contentClass="article-editor"
        onchange={(document) => editor.change(document)}
        onUpload={(file) => editor.upload(file)}
      />
    {/key}
  {:else}
    <ContentFallback {editor} />
  {/if}
  <footer class="document-status" role="status" aria-live="polite">
    {#if editor.selected}
      <Breadcrumb items={crumbs} label="Article path" title={editor.selected.path} />
    {:else}<span>No article selected</span>{/if}
    <div class="document-state">
      <WhichKeyMode showPreset aria-label="Editor mode" />
      <span class={{ error: Boolean(editor.codecError || editor.save.error) }}>{editor.status}</span
      >
    </div>
  </footer>
</main>
