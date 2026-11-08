import { useKeymap } from '@cloudvoyant/helical-svelte'
import type { KeymapMode, WhichKeyNode } from '@cloudvoyant/helical-ui'
import type { KeyScopeOptions } from 'core-ts'

export type UseKeyScopeOptions<TCtx = unknown> = KeyScopeOptions<TCtx>

/**
 * Registers a reactive DOM-scoped keymap for the lifetime of the owning Svelte
 * component via Helical's `useKeymap`.
 */
export function useKeyScope<TCtx = unknown>(options: UseKeyScopeOptions<TCtx>): void {
  useKeymap(
    () => {
      const resolved = typeof options.keymap === 'function' ? options.keymap() : options.keymap
      const nodes: Record<string, WhichKeyNode> = {}
      for (const [rawKey, binding] of Object.entries(resolved)) {
        if (!binding) continue
        const normalizedKey = rawKey.replace(/-(?=.)/g, '+')
        const mode: KeymapMode | KeymapMode[] = binding.mode
          ? Array.isArray(binding.mode)
            ? ([...binding.mode] as KeymapMode[])
            : (binding.mode as KeymapMode)
          : ['normal', 'select', 'insert']
        const node: WhichKeyNode = {
          key: normalizedKey,
          label: binding.label,
          description: binding.description,
          category: binding.category,
          mode,
          hidden: !binding.category,
          when: binding.when
            ? (cmdCtx) => (cmdCtx.event ? binding.when!(options.getContext(), cmdCtx.event) : false)
            : undefined,
          action: (cmdCtx) =>
            cmdCtx.event ? binding.run(options.getContext(), cmdCtx.event) : false,
        }
        nodes[normalizedKey] = node
        if (normalizedKey !== rawKey) {
          nodes[rawKey] = node
        }
      }
      if ((nodes.Home || nodes.End) && !nodes.g) {
        const gotoChildren: Record<string, WhichKeyNode> = {}
        if (nodes.Home) gotoChildren.Home = nodes.Home
        if (nodes.End) gotoChildren.End = nodes.End
        nodes.g = {
          key: 'g',
          label: '+goto',
          group: 'Goto',
          hidden: true,
          children: gotoChildren,
        }
      }
      return nodes
    },
    {
      priority: options.priority,
      enabled: options.enabled,
      element: options.element,
    },
  )
}
