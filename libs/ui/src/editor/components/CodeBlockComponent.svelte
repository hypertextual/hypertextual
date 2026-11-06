<script lang="ts">
  import { codeContent } from './styles'
  import type { CodeBlockComponentProps } from './types'
  import { useKeyScope } from '../../key-scope/useKeyScope.svelte'
  import {
    CodeBlock,
    CodeBlockHeader,
    CodeBlockTitle,
    CodeBlockCopyButton,
  } from '@cloudvoyant/helical-svelte'
  import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectIndicator,
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectItemIndicator,
  } from '@cloudvoyant/helical-svelte'
  import { cn, codeBlockBodyBase, codeBlockContentBase } from '@cloudvoyant/helical-ui'
  import { ChevronsUpDown, Check } from 'lucide-svelte'
  import { createSubscriber } from 'svelte/reactivity'

  // Props ---------------------------------------------------------------------
  let { node, editor, getPos, updateAttributes }: CodeBlockComponentProps = $props()

  // State ---------------------------------------------------------------------
  const subscribe = createSubscriber((update) => editor.subscribe(update))
  let headerEl = $state<HTMLDivElement | null>(null)
  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'bash', label: 'Bash' },
    { value: 'sql', label: 'SQL' },
    { value: 'php', label: 'PHP' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'plaintext', label: 'Plain Text' },
  ]

  // Derived -------------------------------------------------------------------
  const language = $derived((node.attrs.language as string | undefined) || getDefaultLanguage())

  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && editor.isInsertMode
  })

  const currentLanguageLabel = $derived(
    languages.find((l) => l.value === language)?.label || 'JavaScript',
  )

  // Lifecycle -----------------------------------------------------------------
  // Initialize with default language from localStorage
  $effect(() => {
    if (editable && !node.attrs.language) {
      const defaultLang = getDefaultLanguage()
      if (defaultLang !== language) {
        updateAttributes({ language: defaultLang })
      }
    }
  })

  useKeyScope({
    id: 'widget:code-block',
    priority: 'widget',
    element: () => headerEl,
    enabled: () => Boolean(headerEl),
    hotkeys: () => editor.services.hotkeys,
    getContext: () => null,
    keymap: {
      ArrowDown: {
        id: 'codeBlock.focusBodyDown',
        key: 'ArrowDown',
        label: 'Focus Code Body',
        run: (_ctx, event) => {
          const target = event.target as HTMLElement | null
          if (!target) return false
          const trigger = target.closest<HTMLElement>(
            '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]',
          )
          if (trigger) {
            if (trigger.getAttribute('aria-expanded') === 'true') return false
            focusBody()
            return true
          }
          if (target.closest('button')) {
            focusBody()
            return true
          }
          return false
        },
      },
      ArrowUp: {
        id: 'codeBlock.focusBefore',
        key: 'ArrowUp',
        label: 'Focus Above Code Block',
        run: (_ctx, event) => {
          const target = event.target as HTMLElement | null
          if (!target) return false
          const trigger = target.closest<HTMLElement>(
            '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]',
          )
          if (trigger) {
            if (trigger.getAttribute('aria-expanded') === 'true') return false
            focusBefore()
            return true
          }
          if (target.closest('button')) {
            focusBefore()
            return true
          }
          return false
        },
      },
      Tab: {
        id: 'codeBlock.tabNext',
        key: 'Tab',
        label: 'Next Code Block Control',
        run: (_ctx, event) => {
          const target = event.target as HTMLElement | null
          if (!target || !headerEl) return false
          const trigger = target.closest<HTMLElement>(
            '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]',
          )
          if (trigger) {
            if (trigger.getAttribute('aria-expanded') === 'true') return false
            const copyBtn = headerEl.querySelector<HTMLElement>(
              'button[aria-label*="Copy"], button:not([data-scope="select"])',
            )
            if (copyBtn) {
              copyBtn.focus()
            } else {
              focusBody()
            }
            return true
          }
          if (target.closest('button')) {
            focusBody()
            return true
          }
          return false
        },
      },
      'Shift+Tab': {
        id: 'codeBlock.tabPrev',
        key: 'Shift+Tab',
        label: 'Previous Code Block Control',
        run: (_ctx, event) => {
          const target = event.target as HTMLElement | null
          if (!target || !headerEl) return false
          const trigger = target.closest<HTMLElement>(
            '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]',
          )
          if (trigger) {
            if (trigger.getAttribute('aria-expanded') === 'true') return false
            focusBody()
            return true
          }
          if (target.closest('button')) {
            const langTrigger = headerEl.querySelector<HTMLElement>(
              '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]',
            )
            if (langTrigger) {
              langTrigger.focus()
            } else {
              focusBody()
            }
            return true
          }
          return false
        },
      },
    },
  })

  // Methods -------------------------------------------------------------------
  function getDefaultLanguage(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('codeblock-last-language') || 'javascript'
    }
    return 'javascript'
  }

  function changeLanguage(newLanguage: string) {
    updateAttributes({ language: newLanguage })
    if (typeof window !== 'undefined') {
      localStorage.setItem('codeblock-last-language', newLanguage)
    }
  }

  function focusBody() {
    const position = typeof getPos === 'function' ? getPos() : undefined
    if (typeof position !== 'number') return
    editor.focusPosition(position + 1)
  }

  function focusBefore() {
    const position = typeof getPos === 'function' ? getPos() : undefined
    if (typeof position !== 'number') return
    editor.focusBeforePosition(position)
  }
</script>

<div data-node-view-wrapper="" role="none" style="white-space: normal;" class="my-4">
  <CodeBlock code={node.textContent} {language} class="my-0">
    <div bind:this={headerEl}>
      <CodeBlockHeader contenteditable={false}>
        <div class="flex items-center gap-2">
          {#if editable}
            <Select
              items={languages}
              value={[language]}
              onValueChange={(details) => {
                const next = details.value[0]
                if (next) changeLanguage(next)
              }}
              aria-label="Code language"
            >
              <SelectTrigger
                aria-label="Code language"
                size="sm"
                class="min-w-36 justify-between font-mono text-xs focus:border-ring focus:ring-2 focus:ring-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <SelectValue />
                <SelectIndicator>
                  <ChevronsUpDown class="size-3 opacity-50" />
                </SelectIndicator>
              </SelectTrigger>
              <SelectContent data-editor-controls>
                {#each languages as lang (lang.value)}
                  <SelectItem item={lang}>
                    <SelectItemText>{lang.label}</SelectItemText>
                    <SelectItemIndicator><Check class="size-4" /></SelectItemIndicator>
                  </SelectItem>
                {/each}
              </SelectContent>
            </Select>
          {:else}
            <CodeBlockTitle>{currentLanguageLabel}</CodeBlockTitle>
          {/if}
        </div>
        <CodeBlockCopyButton class="ml-auto" />
      </CodeBlockHeader>
    </div>
    <div class={codeBlockBodyBase}>
      <pre class={cn(codeBlockContentBase, codeContent)}><code
          data-node-view-content=""
          class={node.textContent.length === 0 ? 'block' : undefined}
          style="white-space: pre-wrap;"></code></pre>
    </div>
  </CodeBlock>
</div>
