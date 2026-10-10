import { markBenchmark } from './benchmark';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { noteMarked } from './markdownLexer';
import { HtmdChart } from './HtmdChart';
import { SlashMenu } from './SlashMenu';
import { Markdown } from '@tiptap/markdown';
import { NoteTaskList, NoteTable, NoteOrderedList } from './markdownExtensions';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Block } from './api';
import { Prose } from '@helical/prose';

// Decorations never enter the document or change its measured text layout.
const CursorMarkers = Extension.create({
  name: 'cursorMarkers',
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      if (!state.selection.empty) return DecorationSet.empty;
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name !== 'heading') continue;
        return DecorationSet.create(state.doc, [Decoration.node($from.before(depth), $from.after(depth), {
          class: 'cursor-heading', 'data-markdown-marker': '#'.repeat(node.attrs.level),
          'aria-label': node.textContent,
        })]);
      }
      return DecorationSet.empty;
    } } })];
  },
});

export interface EditorHandle { source: () => string; editable: (value: boolean) => void }
export function NoteEditor({ source, blocks, register, onDirty }: {
  source: string; blocks: Block[]; register: (handle: EditorHandle | undefined) => void; onDirty: () => void;
}) {
  const callbacks = useRef({ register, onDirty });
  callbacks.current = { register, onDirty };
  // An instance per document prevents tokenizer registrations accumulating
  // on marked's global singleton as files are opened. Tiptap types this option
  // as the callable singleton, though it uses the instance's lexer API only.
  const markdown = useMemo(() => Markdown.configure({ marked: noteMarked(source, blocks) }), []);
  const extensions = useMemo(() => [StarterKit.configure({ trailingNode: false, orderedList: false, link: { openOnClick: false } }), markdown, NoteTaskList, NoteOrderedList,
      TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }), TableKit.configure({ table: false }), NoteTable, HtmdChart, CursorMarkers, SlashMenu], [markdown]);
  const editor = useEditor({
    extensions, content: source.replace(/(?:\r?\n)+$/, ''), contentType: 'markdown', shouldRerenderOnTransaction: false,
    editorProps: { handleKeyDown(_view, event) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) requestAnimationFrame(markBenchmark); return false; }, attributes: { role: 'textbox', 'aria-label': 'Note content', 'aria-multiline': 'true', spellcheck: 'false' } },
    onCreate() { requestAnimationFrame(markBenchmark); },
    onUpdate() { markBenchmark(); callbacks.current.onDirty(); },
  });
  useEffect(() => {
    if (!editor) return;
    const initial = editor.state.doc;
    const originals = new Map<ProseMirrorNode, string>();
    // Rust and Tiptap both parse CommonMark/GFM. When their top-level counts
    // agree, retain source by persistent ProseMirror node identity. Do not
    // reparse every block here; the full document has already been parsed.
    if (initial.childCount === blocks.length) initial.forEach((node, _offset, index) => {
      originals.set(node, blocks[index].source);
    });
    const readSource = () => {
      if (editor.state.doc.eq(initial)) return source;
      if (originals.size !== initial.childCount) return editor.getMarkdown() + '\n';
      const parts: string[] = [];
      editor.state.doc.forEach(node => {
        const retained = originals.get(node);
        parts.push(retained ?? editor.markdown!.serialize({ type: 'doc', content: [node.toJSON()] }).trimEnd() + '\n\n');
      });
      return parts.join('');
    };
    callbacks.current.register({ source: readSource,
      editable: value => editor.setEditable(value, false) });
    return () => callbacks.current.register(undefined);
  }, [editor, source, blocks]);
  return <Prose className="rich-content continuous-editor"><EditorContent editor={editor} /></Prose>;
}
