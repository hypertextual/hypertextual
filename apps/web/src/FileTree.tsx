import { useRef, useState } from 'react';
import type { Entry } from './api';

export function FileTree({ entries, selected, onSelect }: {
  entries: Entry[]; selected?: string; onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string>();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rows: { entry: Entry; depth: number; parent?: string }[] = [];
  function flatten(items: Entry[], depth = 0, parent?: string) {
    for (const entry of items) {
      rows.push({ entry, depth, parent });
      if (entry.directory && !collapsed.has(entry.path)) flatten(entry.children, depth + 1, entry.path);
    }
  }
  flatten(entries);
  function collapse(path: string, value: boolean) {
    setCollapsed(old => { const next = new Set(old); value ? next.add(path) : next.delete(path); return next; });
  }
  function focus(path?: string) { if (path) { setFocused(path); buttons.current.get(path)?.focus(); } }
  const tabStop = rows.some(row => row.entry.path === focused) ? focused : selected ?? rows[0]?.entry.path;
  return <ul className="file-tree" role="tree" aria-label="Vault files">
    {rows.map(({ entry, depth, parent }, index) => <li key={entry.path} role="none">
      <button ref={el => { if (el) buttons.current.set(entry.path, el); else buttons.current.delete(entry.path); }}
        role="treeitem" aria-level={depth + 1} aria-selected={entry.directory ? undefined : selected === entry.path}
        aria-expanded={entry.directory ? !collapsed.has(entry.path) : undefined}
        tabIndex={tabStop === entry.path ? 0 : -1}
        className={`tree-row ${selected === entry.path ? 'selected' : ''}`} style={{ paddingLeft: 14 + depth * 16 }}
        onFocus={() => setFocused(entry.path)}
        onClick={() => entry.directory ? collapse(entry.path, !collapsed.has(entry.path)) : onSelect(entry.path)}
        onKeyDown={event => {
          switch (event.key) {
            case 'ArrowDown': focus(rows[index + 1]?.entry.path); break;
            case 'ArrowUp': focus(rows[index - 1]?.entry.path); break;
            case 'Home': focus(rows[0]?.entry.path); break;
            case 'End': focus(rows.at(-1)?.entry.path); break;
            case 'ArrowRight': if (entry.directory) { if (collapsed.has(entry.path)) collapse(entry.path, false); else focus(rows[index + 1]?.entry.path); } break;
            case 'ArrowLeft': if (entry.directory && !collapsed.has(entry.path)) collapse(entry.path, true); else focus(parent); break;
            default: return;
          }
          event.preventDefault();
        }}>
        <span className="tree-icon" aria-hidden>{entry.directory ? (collapsed.has(entry.path) ? '▸' : '▾') : '▤'}</span>
        <span>{entry.directory ? entry.name : entry.name.replace(/\.(htmd|md)$/, '')}</span>
        {!entry.directory && <span className="file-extension">{entry.name.split('.').pop()}</span>}
      </button>
    </li>)}
  </ul>;
}
