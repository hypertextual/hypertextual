import { useEffect, useRef, useState } from 'react';
import { api, type Entry, type Note } from './api';
import { FileTree } from './FileTree';
import { NoteEditor, type EditorHandle } from './NoteEditor';

export function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [note, setNote] = useState<Note>();
  const current = useRef<Note | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const [status, setStatus] = useState('Opening vault…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openMs, setOpenMs] = useState<number>();
  const scroll = useRef<HTMLDivElement>(null);
  const pending = useRef(Promise.resolve());

  function enqueue(operation: () => Promise<void>) {
    pending.current = pending.current.then(async () => {
      setBusy(true);
      try { await operation(); setError(''); }
      catch (error) { setError(String(error)); setStatus('Edits kept in memory'); }
      finally { setBusy(false); }
    });
  }

  async function saveCurrent() {
    const doc = current.current;
    if (!doc) return;
    const source = editor.current?.source() ?? doc.original;
    if (source !== doc.original) {
      await api.save(doc, source);
      current.current = { ...doc, original: source };
    }
    const stillDirty = editor.current?.source() !== source;
    setDirty(stillDirty); setStatus(stillDirty ? 'Unsaved changes' : 'Saved to vault');
  }

  function selectFile(path: string) {
    enqueue(async () => {
      if (current.current?.path === path) return;
      editor.current?.editable(false);
      try {
      await saveCurrent();
      const start = performance.now();
      const doc = await api.open(path);
      current.current = doc; setNote(doc); setDirty(false);
      scroll.current?.scrollTo({ top: 0 });
      setOpenMs(performance.now() - start); setStatus('Saved to vault');
      } finally { editor.current?.editable(true); }
    });
  }

  useEffect(() => {
    let alive = true;
    api.tree().then(tree => {
      if (!alive) return;
      setEntries(tree);
      const first = tree.find(e => e.name === 'Welcome.htmd') ?? firstFile(tree);
      if (first) selectFile(first.path); else setStatus('Vault has no Markdown notes');
    }).catch(error => alive && setError(`Could not open vault: ${error}`));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault(); enqueue(saveCurrent);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return <div className="workspace">
    <aside className="rail"><div className="brand-mark">h</div><span className="rail-active">▤</span><span>⌕</span><span className="rail-bottom">◇</span></aside>
    <aside className="sidebar">
      <header className="vault-heading"><span className="vault-symbol">◇</span><div><strong>Hypertextual</strong><span>LOCAL VAULT</span></div></header>
      <div className="section-label">FILES <span>{countFiles(entries)} notes</span></div>
      <div className="tree-scroll"><FileTree entries={entries} selected={note?.path} onSelect={selectFile} /></div>
      <footer className="sidebar-footer"><span className="framework-dot" /> Tauri / WebView <span>PoC</span></footer>
    </aside>
    <main className="main-pane">
      <header className="note-toolbar"><div><span className="breadcrumb">Vault / </span>{note?.path ?? 'No note selected'}{dirty && <span className="dirty-dot" title="Unsaved changes"> ●</span>}</div><button onClick={() => enqueue(saveCurrent)} disabled={busy}>Save <kbd>⌘ S</kbd></button></header>
      {error && <div role="alert" className="error">{error}</div>}
      <div className="document-scroll" ref={scroll}>
        {note && <article className="document" aria-label="Note editor">
          <div className="document-eyebrow">{note.path.endsWith('.md') ? 'MARKDOWN · COMPATIBLE' : 'HTMD · NOTE'}</div>
          <NoteEditor key={note.path} blocks={note.blocks} source={note.blocks.map(b => b.source).join('')}
            register={handle => { editor.current = handle; }}
            onDirty={() => { setDirty(true); setStatus('Unsaved changes'); }} />
        </article>}
      </div>
      <footer className="status-bar"><span>{status}</span><span>Continuous editor · File read {openMs?.toFixed(1) ?? '—'} ms</span></footer>
    </main>
  </div>;
}

function firstFile(entries: Entry[]): Entry | undefined {
  for (const entry of entries) { if (!entry.directory) return entry; const found = firstFile(entry.children); if (found) return found; }
}
function countFiles(entries: Entry[]): number { return entries.reduce((count, e) => count + (e.directory ? countFiles(e.children) : 1), 0); }
