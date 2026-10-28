// libs/helical-ui/src/editor/extensions/slash-commands.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/slash-commands.ts.
// Media commands open registered overlays. The host supplies suggestion rendering.
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { SlashCommandItem } from '../types'

export const SlashCommands = Extension.create<{
  suggestion: Omit<SuggestionOptions<SlashCommandItem>, 'editor'>
}>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: new PluginKey('slashCommands'),
        command: ({
          editor,
          range,
          props,
        }: {
          editor: import('@tiptap/core').Editor
          range: { from: number; to: number }
          props: SlashCommandItem
        }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }): SlashCommandItem[] => {
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
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .setCodeBlock({ language: 'plaintext' })
                  .run()
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
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
