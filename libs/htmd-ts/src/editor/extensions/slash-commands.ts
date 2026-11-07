import type { Editor as TiptapEditor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { defineHtmdExtension } from '../define-htmd-extension.js'
import type { HtmdSlashCommandEditor, SlashCommandItem } from '../types.js'
import { isEditorInInsertMode } from './modal-editing.js'

// types ---------------------------------------------------------------------

export interface SlashCommandsOptions {
  suggestion: Omit<SuggestionOptions<SlashCommandItem>, 'editor'>
}

const slashCommandsKey = new PluginKey('slashCommands')

// api -----------------------------------------------------------------------

/**
 * Slash command palette extension triggered by typing `/` in insert mode to
 * insert headings, lists, notices, code blocks, or media overlays:
 *
 * ```text
 * /no|
 * +------------------------------------+
 * | [!] Notice                         |
 * |     Insert a styled callout        |
 * +------------------------------------+
 * ```
 */
export const SlashCommands = defineHtmdExtension<SlashCommandsOptions>({
  name: 'slashCommands',
  kind: 'behavior',
  defaultOptions: () => ({
    suggestion: {
      char: '/',
      pluginKey: slashCommandsKey,
      allow: ({ editor }: { editor: unknown }) => isEditorInInsertMode(editor as TiptapEditor),
      command: ({
        editor,
        range,
        props,
      }: {
        editor: unknown
        range: { from: number; to: number }
        props: SlashCommandItem
      }) => {
        props.command({ editor: editor as HtmdSlashCommandEditor, range })
      },
      items: ({ query }: { query: string }): SlashCommandItem[] => filterSlashCommands(query),
    },
  }),
  pmPlugins({ editor, options }) {
    return [createSlashCommandsPlugin(editor, options)]
  },
})

// pm ------------------------------------------------------------------------

function createSlashCommandsPlugin(editor: TiptapEditor, options: SlashCommandsOptions): Plugin {
  return Suggestion({
    editor,
    ...options.suggestion,
  })
}

// helpers -------------------------------------------------------------------

function filterSlashCommands(query: string): SlashCommandItem[] {
  const commands: SlashCommandItem[] = [
    {
      title: 'Heading 1',
      description: 'Large section heading',
      icon: 'Heading1',
      category: 'suggested',
      shortcut: '#',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: 'Heading2',
      category: 'suggested',
      shortcut: '##',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: 'Heading3',
      category: 'suggested',
      shortcut: '###',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run()
      },
    },
    {
      title: 'Heading 4',
      description: 'Minor section heading',
      icon: 'Heading4',
      category: 'suggested',
      shortcut: '####',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 5 }).run()
      },
    },
    {
      title: 'Quote',
      description: 'Insert a blockquote',
      icon: 'Quote',
      category: 'basic',
      shortcut: '>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run()
      },
    },
    {
      title: 'Notice',
      description: 'Insert a styled callout',
      icon: 'MessageSquareWarning',
      category: 'basic',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertNotice({ variant: 'info', title: 'Note' })
          .run()
      },
    },
    {
      title: 'Bullet List',
      description: 'Create a bulleted list',
      icon: 'List',
      category: 'suggested',
      shortcut: '-',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      },
    },
    {
      title: 'Numbered List',
      description: 'Create a numbered list',
      icon: 'ListOrdered',
      category: 'suggested',
      shortcut: '1.',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      },
    },
    {
      title: 'Todo List',
      description: 'Create a task list with checkboxes',
      icon: 'ListTodo',
      category: 'suggested',
      shortcut: '[]',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run()
      },
    },
    {
      title: 'Divider',
      description: 'Insert a horizontal divider',
      icon: 'Minus',
      category: 'basic',
      shortcut: '---',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run()
      },
    },
    {
      title: 'Code Block',
      description: 'Insert a code block with syntax highlighting',
      icon: 'Code',
      category: 'advanced',
      shortcut: '```',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setCodeBlock({ language: 'plaintext' }).run()
      },
    },
    {
      title: 'YouTube',
      description: 'Embed a YouTube video',
      icon: 'YouTube',
      category: 'media',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .openOverlay('youtube', { position: range.from })
          .run()
      },
    },
    {
      title: 'Image',
      description: 'Upload an image from your computer',
      icon: 'Image',
      category: 'media',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .openOverlay('image', { position: range.from })
          .run()
      },
    },
    {
      title: 'Bookmark',
      description: 'Create a rich link preview card',
      icon: 'Bookmark',
      category: 'media',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .openOverlay('bookmark', { position: range.from })
          .run()
      },
    },
  ]

  return commands.filter((item) => item.title.toLowerCase().startsWith(query.toLowerCase()))
}
