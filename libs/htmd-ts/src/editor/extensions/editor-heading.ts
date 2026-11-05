import { defineHtmdExtension } from '../define-htmd-extension.js'

export interface EditorHeadingOptions {
  levels: Array<1 | 2 | 3 | 4 | 5 | 6>
  HTMLAttributes: Record<string, unknown>
}

// Editor heading rules keep the document H1 reserved for the enforced title.
// Both `# ` (logical Heading 1) and conventional `## ` create an HTML H2;
// deeper Markdown markers retain their matching HTML levels.
export const EditorHeading = defineHtmdExtension<EditorHeadingOptions>({
  name: 'heading',
  kind: 'node',
  base: 'heading',
  defaultOptions: () => ({
    levels: [1, 2, 3, 4, 5, 6],
    HTMLAttributes: {},
  }),
  textblockInputRules({ options }) {
    const rules = options.levels.map((level) => ({
      find: new RegExp(`^(#{${level}})\\s$`),
      getAttributes: { level },
    }))

    if (options.levels.includes(2)) {
      rules.unshift({
        find: /^#\s$/,
        getAttributes: { level: 2 },
      })
    }

    return rules
  },
})
