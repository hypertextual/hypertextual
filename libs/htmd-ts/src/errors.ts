/** Editor JSON has unknown nodes/marks/attributes, invalid values, or invalid nesting. */
export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDocumentError'
  }
}

/** The writer failed, raw inline source escaped its paragraph, or reopening would change document content or attributes. */
export class MarkdownSerializationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkdownSerializationError'
  }
}

/** The Markdown engine failed to produce valid document JSON after local token recovery. Unsupported source normally returns issues instead. */
export class MarkdownParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkdownParseError'
  }
}
