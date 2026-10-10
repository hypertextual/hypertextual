import { Marked, Lexer, type marked, type Token, type TokensList } from 'marked';
import type { Block } from './api';

// Bound the strings fed to block tokenizers using the shared Rust parser's
// top-level boundaries. A single Marked lexer retains the reference-link map
// and inline queue for the entire document. Lists, fences and tables are never
// split. This avoids repeatedly scanning the tail of a large Unicode note in
// WebKit while keeping one ProseMirror document and native selection surface.
export function noteMarked(source: string, blocks: Block[]): typeof marked {
  const instance = new Marked();
  if (blocks.length < 128 || blocks.map(block => block.source).join('') !== source) return instance as unknown as typeof marked;
  const normalized = source.replace(/\r\n|\r/g, '\n').replace(/\n+$/, '');
  const chunks: string[] = [];
  for (let index = 0; index < blocks.length; index += 64) {
    chunks.push(blocks.slice(index, index + 64).map(block => block.source).join('').replace(/\r\n|\r/g, '\n'));
  }
  chunks[chunks.length - 1] = chunks[chunks.length - 1].replace(/\n+$/, '');
  class NoteLexer<ParserOutput = string, RendererOutput = string> extends Lexer<ParserOutput, RendererOutput> {
    blockTokens(src: string, tokens?: Token[], clipped?: boolean): Token[];
    blockTokens(src: string, tokens?: TokensList, clipped?: boolean): TokensList;
    blockTokens(src: string, tokens: Token[] = this.tokens, clipped?: boolean): Token[] {
      if (src !== normalized || tokens !== this.tokens) return super.blockTokens(src, tokens, clipped);
      for (const chunk of chunks) super.blockTokens(chunk, tokens, clipped);
      return tokens;
    }
  }
  instance.Lexer = NoteLexer;
  return instance as unknown as typeof marked;
}
