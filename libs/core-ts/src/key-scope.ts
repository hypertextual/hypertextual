import { matchesKeyboardEvent } from '@tanstack/hotkeys'

/**
 * Checks whether a DOM `KeyboardEvent` matches a keymap key or chord string
 * (`'Escape'`, `'Shift-Tab'`, `'Mod-b'`, `'a'`, `'A'`) via `@tanstack/hotkeys`.
 */
export function matchesKeyBinding(event: KeyboardEvent, key: string): boolean {
  if (!key) return false
  if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return event.key === key
  }
  const chord = key.replace(/-(?=.)/g, '+') as Parameters<typeof matchesKeyboardEvent>[1]
  return matchesKeyboardEvent(event, chord, 'mac') || matchesKeyboardEvent(event, chord, 'windows')
}
