/** Native ProseMirror document JSON; no editor or parser instance crosses this boundary. */
export interface JSONContent {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONContent[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

/** One source fragment retained because its syntax is unsupported or invalid. */
export interface ParseIssue {
  code: 'unsupported-syntax' | 'invalid-syntax'
  kind: string
  message: string
  source: string
}

/** Parsed document and recoverable diagnostics; clients choose whether to reject issues. */
export interface ParseResult {
  content: JSONContent
  issues: ParseIssue[]
}
