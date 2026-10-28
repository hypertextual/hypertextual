// Editor heading rules keep the document H1 reserved for the enforced title.
// Both `# ` (logical Heading 1) and conventional `## ` create an HTML H2;
// deeper Markdown markers retain their matching HTML levels.
import { textblockTypeInputRule } from '@tiptap/core'
import { Heading, type Level } from '@tiptap/extension-heading'

export const EditorHeading = Heading.extend({
  addInputRules() {
    const rules = this.options.levels.map((level: Level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        type: this.type,
        getAttributes: { level },
      }),
    )

    if (this.options.levels.includes(2)) {
      rules.unshift(
        textblockTypeInputRule({
          find: /^#\s$/,
          type: this.type,
          getAttributes: { level: 2 },
        }),
      )
    }

    return rules
  },
})
