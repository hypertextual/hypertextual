import OrderedList from '@tiptap/extension-ordered-list';
import TaskList from '@tiptap/extension-task-list';
import { Table } from '@tiptap/extension-table';

// Tiptap 3.31.4 probes these tokenizers at every paragraph. The stock task
// tokenizer splits the entire remaining document even when it isn't a list;
// the stock table start callback also splits all remaining lines. These guards
// retain the upstream parsers while avoiding that quadratic work on long notes.
const taskTokenizer = TaskList.config.markdownTokenizer!;
export const NoteTaskList = TaskList.extend({
  markdownTokenizer: {
    ...taskTokenizer,
    tokenize(src, tokens, helpers) {
      if (!/^\s*[-+*]\s+\[[ xX]\]\s+/.test(src)) return undefined;
      return taskTokenizer.tokenize(src, tokens, helpers);
    },
  },
});
const tableTokenizer = Table.config.markdownTokenizer!;
export const NoteTable = Table.extend({
  markdownTokenizer: {
    ...tableTokenizer,
    start(src) {
      const firstEnd = src.indexOf('\n');
      if (firstEnd < 0) return -1;
      const secondEnd = src.indexOf('\n', firstEnd + 1);
      const separator = src.slice(firstEnd + 1, secondEnd < 0 ? undefined : secondEnd);
      return src.slice(0, firstEnd).includes('|') && separator.includes('|') && /^[ \t|:]*-[ \t|:-]*$/.test(separator) ? 0 : -1;
    },
  },
});

const orderedTokenizer = OrderedList.config.markdownTokenizer!;
export const NoteOrderedList = OrderedList.extend({
  markdownTokenizer: {
    ...orderedTokenizer,
    tokenize(src, tokens, helpers) {
      if (!/^[ \t]*\d+[.)][ \t]+/.test(src)) return undefined;
      return orderedTokenizer.tokenize(src, tokens, helpers);
    },
  },
});
