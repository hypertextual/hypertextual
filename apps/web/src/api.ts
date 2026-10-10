import { invoke } from '@tauri-apps/api/core';

export interface Entry { name: string; path: string; directory: boolean; children: Entry[] }
export interface Block { source: string }
export interface Note { path: string; original: string; blocks: Block[] }

export const api = {
  tree: () => invoke<Entry[]>('tree'),
  open: (path: string) => invoke<Note>('open_note', { path }),
  parse: (source: string) => invoke<Block[]>('parse_blocks', { source }),
  save: (note: Note, source: string) => invoke<void>('save_note', { path: note.path, expected: note.original, source }),
};
