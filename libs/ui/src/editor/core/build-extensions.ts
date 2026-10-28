// libs/helical-ui/src/editor/build-extensions.ts
// Framework-agnostic mirror of the source editor's extension array. Both framework packages
// call this and inject their own node-view renderers, so helical-ui never imports svelte/react.
//
// Substitutions per the port's dependency decision:
//   - text-color  -> @tiptap/extension-color  (was a hand-rolled mark)
//   - @weiruo/tiptap-extension-indent -> DROPPED (StarterKit's ListItem handles list nesting)
//
// This module also loads StarterKit, which brings the whole bundled extension graph (and its
// command type augmentations) into the program — which is why the slash-command file's
// toggleBlockquote / toggleBulletList / setHorizontalRule / etc. resolve.
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import { common, createLowlight } from 'lowlight'
import type { Extensions } from '@tiptap/core'

import { UnparsedBlock } from './extensions/unparsed-block'
import { UnparsedInline } from './extensions/unparsed-inline'
import { TitleHeading } from './extensions/title-heading'
import { ExitHeading } from './extensions/exit-heading'
import { HeadingWithId } from './extensions/heading-with-id'
import { EditorHeading } from './extensions/editor-heading'
import { SlashCommands } from './extensions/slash-commands'
import { CodeBlockCustom } from './extensions/code-block-custom'
import { ImageNode } from './extensions/image-node'
import { UrlMention } from './extensions/url-mention'
import { LinkPreview } from './extensions/link-preview'
import { InternalMention } from './extensions/internal-mention'
import { NoticeNode } from './extensions/notice-node'
import { CurrentEmptyBlock } from './extensions/current-empty-block'
import { PasteUrl } from './extensions/paste-url'
import { EditorOverlays } from './extensions/editor-overlays'
import type { BuildExtensionsOptions } from './types'

export function buildExtensions(options: BuildExtensionsOptions): Extensions {
  const { nodeViews, mentionSource, hrefBuilder, mentionRender, slashRender, headingWithId } =
    options
  const enforceTitle = options.enforceTitle ?? true
  const lowlight = createLowlight(common)

  return [
    StarterKit.configure({
      codeBlock: false, // we use CodeBlockCustom
      link: false, // we configure Link explicitly below
      underline: false, // we configure Underline explicitly below
      heading: false, // Reader and editor install their own heading variants below.
    }),
    ...(headingWithId
      ? [HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] })]
      : [EditorHeading.configure({ levels: [1, 2, 3, 4, 5, 6] })]),
    ...(enforceTitle ? [TitleHeading, ExitHeading] : []),
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ node }) =>
        node.type.name === 'codeBlock'
          ? ''
          : options.placeholder
            ? options.placeholder(node.type.name, node.attrs.level)
            : node.type.name === 'heading' && node.attrs.level === 1
              ? 'Untitled'
              : "Type '/' for commands",
    }),
    UnparsedBlock.configure({ nodeView: nodeViews.unparsedBlock }),
    UnparsedInline.configure({ nodeView: nodeViews.unparsedInline }),
    CurrentEmptyBlock,
    PasteUrl,
    EditorOverlays.configure({
      overlays: options.overlays ?? {},
      onChange: options.onOverlayChange,
    }),
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Typography,
    Underline,
    TextStyle,
    Color,
    CodeBlockCustom.configure({ lowlight, nodeView: nodeViews.codeBlock }),
    CharacterCount.configure({ mode: 'textSize' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoticeNode.configure({ nodeView: nodeViews.notice }),
    InternalMention.configure({
      hrefBuilder,
      suggestion: {
        items: async ({ query }) => {
          try {
            return (await mentionSource?.(query)) ?? []
          } catch {
            return []
          }
        },
        // Without a framework-supplied render the suggestion is inert, so fall back to a no-op
        // rather than throwing when a consumer builds extensions headlessly (e.g. unit tests).
        render: mentionRender ?? (() => ({})),
      },
    }),
    LinkPreview.configure({ nodeView: nodeViews.linkPreview }),
    ImageNode.configure({ nodeView: nodeViews.image }),
    UrlMention.configure({ nodeView: nodeViews.urlMention }),
    SlashCommands.configure({ suggestion: { render: slashRender ?? (() => ({})) } }),
  ] as Extensions
}
