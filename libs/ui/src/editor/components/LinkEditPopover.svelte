<script lang="ts">
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import type { LinkEditPopoverProps } from './types'
  import { onMount, onDestroy } from 'svelte'
  import { Trash2, Globe, ExternalLink } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { editor, initialUrl = '', onSave, onRemove, onClose }: LinkEditPopoverProps = $props()

  // State ---------------------------------------------------------------------
  let rootElement = $state<HTMLDivElement | null>(null)
  let inputElement: HTMLInputElement

  let isFocused = $state(false)

  let blurTimer: ReturnType<typeof setTimeout> | undefined

  // Derived -------------------------------------------------------------------
  let linkUrl = $derived(initialUrl)

  // Lifecycle -----------------------------------------------------------------
  onMount(() => inputElement?.focus())

  onDestroy(() => clearTimeout(blurTimer))

  useKeymap(
    {
      Enter: {
        key: 'Enter',
        label: 'Save Link',
        hidden: true,
        action: () => {
          saveAndClose()
          return true
        },
      },
      Escape: {
        key: 'Escape',
        label: 'Close Link Editor',
        hidden: true,
        action: () => {
          saveAndClose()
          editor.execCommand('exitToNormal')
          return true
        },
      },
    },
    {
      priority: 'overlay',
      element: () => rootElement,
      enabled: () => Boolean(rootElement),
    },
  )

  // Methods -------------------------------------------------------------------
  function saveAndClose() {
    clearTimeout(blurTimer)
    if (linkUrl.trim()) {
      if (onSave) {
        void onSave(linkUrl.trim())
      } else {
        editor.execCommand('setLink', linkUrl.trim())
      }
    } else if (onRemove) {
      onRemove()
    } else {
      editor.execCommand('unsetLink')
    }
    onClose()
  }

  function removeLink() {
    clearTimeout(blurTimer)
    if (onRemove) {
      onRemove()
    } else {
      editor.execCommand('unsetLink')
    }
    onClose()
  }

  function handleBlur() {
    isFocused = false
    // Small delay to allow clicking trash button
    blurTimer = setTimeout(saveAndClose, 100)
  }
</script>

<div
  bind:this={rootElement}
  data-link-editor
  role="dialog"
  aria-label="Edit link"
  class={[
    'absolute start-0 top-full z-50 mt-2 rounded border shadow-lg bg-popover text-popover-foreground',
    isFocused ? 'border-ring' : 'border-border',
  ]}
  style="width: 280px"
>
  <div class="flex items-center gap-2 px-2">
    <span class="text-foreground/60 flex-shrink-0">
      <Globe size={16} />
    </span>
    <input
      bind:this={inputElement}
      type="text"
      bind:value={linkUrl}
      placeholder="Enter URL"
      class={[
        'flex-1 px-1.5 my-1 text-sm outline-none border-none rounded',
        isFocused ? 'bg-background' : 'bg-muted',
      ]}
      style="padding-top: 0.25rem !important; padding-bottom: 0.25rem !important;"
      onfocus={() => (isFocused = true)}
      onblur={handleBlur}
    />
    <button
      type="button"
      class="rounded p-1 hover:bg-accent hover:text-accent-foreground text-foreground/60 hover:text-foreground flex-shrink-0"
      onclick={removeLink}
      title="Remove link"
    >
      <Trash2 size={16} />
    </button>
    {#if linkUrl}
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="rounded p-1 hover:bg-accent hover:text-accent-foreground text-foreground/60 hover:text-foreground flex-shrink-0"
        title="Open in new tab"
      >
        <ExternalLink size={16} />
      </a>
    {/if}
  </div>
</div>
