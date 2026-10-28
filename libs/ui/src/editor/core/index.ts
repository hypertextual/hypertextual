// libs/helical-ui/src/editor/index.ts
// Framework-agnostic editor layer. The Svelte and React packages import from here and supply
// their own node-view renderers + suggestion menu mounts, so this module never imports
// svelte or react.
export * from './types'
export { buildExtensions } from './build-extensions'
export { PasteUrl } from './extensions/paste-url'

export { TitleHeading } from './extensions/title-heading'
export { ExitHeading } from './extensions/exit-heading'
export { HeadingWithId } from './extensions/heading-with-id'
export { EditorHeading } from './extensions/editor-heading'
export { SlashCommands } from './extensions/slash-commands'
export { EditorOverlays, editorOverlaysKey } from './extensions/editor-overlays'
export { CodeBlockCustom } from './extensions/code-block-custom'
export { ImageNode } from './extensions/image-node'
export { UrlMention } from './extensions/url-mention'
export { LinkPreview } from './extensions/link-preview'
export { InternalMention } from './extensions/internal-mention'
export { NoticeNode, type NoticeAttributes, type NoticeVariant } from './extensions/notice-node'

export { UnparsedBlock } from './extensions/unparsed-block'
export { UnparsedInline } from './extensions/unparsed-inline'
