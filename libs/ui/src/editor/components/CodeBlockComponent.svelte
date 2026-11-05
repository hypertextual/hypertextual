<script lang="ts">
  import { codeContent } from './styles'
  import type { CodeBlockComponentProps } from './types'
  import { isEditorInInsertMode, subscribeToEditorTransactions } from '../core'
  import { Selection } from '@tiptap/pm/state'
  import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap'
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
  const subscribe = createSubscriber((update) => subscribeToEditorTransactions(editor, update))
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
  const language = $derived(node.attrs.language || getDefaultLanguage())

  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && isEditorInInsertMode(editor)
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
    editor.commands.setTextSelection(position + 1)
    editor.view.focus()
  }

  function focusBefore() {
    const position = typeof getPos === 'function' ? getPos() : undefined
    if (typeof position !== 'number') return
    const selection = Selection.findFrom(editor.state.doc.resolve(position), -1, true)
    if (!selection) return
    editor.commands.setTextSelection(selection.from)
    editor.view.focus()
  }

  function handleHeaderKeydownCapture(event: KeyboardEvent) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const header = event.currentTarget as HTMLElement
    const trigger = target.closest<HTMLElement>('[data-part="trigger"]')
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        focusBefore()
      } else if (event.key === 'Tab' && !event.shiftKey) {
        const copyBtn = header.querySelector<HTMLElement>(
          'button[aria-label*="Copy"], button:not([data-part="trigger"])',
        )
        if (copyBtn) {
          event.preventDefault()
          event.stopPropagation()
          copyBtn.focus()
        } else {
          event.preventDefault()
          event.stopPropagation()
          focusBody()
        }
      } else if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
      }
      return
    }

    const button = target.closest<HTMLElement>('button')
    if (button) {
      if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault()
        event.stopPropagation()
        focusBody()
      } else if (event.key === 'Tab' && event.shiftKey) {
        const langTrigger = header.querySelector<HTMLElement>('[data-part="trigger"]')
        if (langTrigger) {
          event.preventDefault()
          event.stopPropagation()
          langTrigger.focus()
        } else {
          event.preventDefault()
          event.stopPropagation()
          focusBody()
        }
      }
    }
  }
</script>

<NodeViewWrapper class="my-4">
  <CodeBlock code={node.textContent} {language} class="my-0">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div onkeydowncapture={handleHeaderKeydownCapture}>
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
      <pre class={cn(codeBlockContentBase, codeContent)}><NodeViewContent as="code" /></pre>
    </div>
  </CodeBlock>
</NodeViewWrapper>
