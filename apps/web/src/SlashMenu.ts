import { defaultChartSource } from './HtmdChart';
import { Extension, type ChainedCommands } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';

interface ComponentItem { title: string; description: string; icon: string; apply: (chain: ChainedCommands) => ChainedCommands }
const components: ComponentItem[] = [
  { title: 'Text', description: 'Plain paragraph', icon: 'T', apply: c => c.setParagraph() },
  ...([1, 2, 3, 4, 5, 6] as const).map(level => ({ title: `Heading ${level}`, description: `${'#'.repeat(level)} Section heading`, icon: `H${level}`, apply: (c: ChainedCommands) => c.setHeading({ level }) })),
  { title: 'Bullet list', description: 'Unordered items', icon: '•', apply: c => c.toggleBulletList() },
  { title: 'Numbered list', description: 'Ordered items', icon: '1.', apply: c => c.toggleOrderedList() },
  { title: 'Task list', description: 'Checkboxes', icon: '☑', apply: c => c.toggleTaskList() },
  { title: 'Quote', description: 'Quoted text', icon: '❝', apply: c => c.setBlockquote() },
  { title: 'Code block', description: 'Fenced code', icon: '<>', apply: c => c.setCodeBlock() },
  { title: 'Table', description: 'Three columns with a header', icon: '▦', apply: c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { title: 'Chart', description: 'HTMD bar chart with editable data', icon: '▥', apply: c => c.insertContent([{ type: 'htmdChart', attrs: { source: defaultChartSource } }, { type: 'paragraph' }]) },
  { title: 'Divider', description: 'Horizontal rule', icon: '—', apply: c => c.setHorizontalRule() },
];
const key = new PluginKey('noteSlashMenu');

export const SlashMenu = Extension.create({
  name: 'noteSlashMenu',
  addProseMirrorPlugins() {
    return [Suggestion<ComponentItem>({
      editor: this.editor, pluginKey: key, char: '/',
      allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name === 'paragraph',
      items: ({ query }) => components.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())),
      command: ({ editor, range, props }) => props.apply(editor.chain().focus().deleteRange(range)).run(),
      render: () => {
        let menu: HTMLDivElement | undefined;
        let current: SuggestionProps<ComponentItem> | undefined;
        let selected = 0;
        let selectedTitle: string | undefined;
        let editorDom: HTMLElement | undefined;
        let activeEditor: SuggestionProps<ComponentItem>['editor'] | undefined;
        const blur = () => { if (activeEditor) exitSuggestion(activeEditor.view, key); };
        const listId = `slash-menu-${Math.random().toString(36).slice(2)}`;
        const reposition = () => {
          if (!menu || !current) return;
          const rect = current.clientRect?.();
          if (!rect) return;
          const height = Math.min(menu.scrollHeight, 360);
          const top = rect.bottom + 8 + height < innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8);
          menu.style.top = `${top}px`;
          menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 296))}px`;
        };
        const paint = (props: SuggestionProps<ComponentItem>) => {
          current = props;
          if (!menu) return;
          menu.replaceChildren();
          if (!props.items.length) {
            const empty = document.createElement('div'); empty.className = 'slash-empty'; empty.textContent = 'No matching components'; menu.append(empty);
            editorDom?.removeAttribute('aria-activedescendant');
          }
          props.items.forEach((item, index) => {
            const button = document.createElement('button');
            button.id = `${listId}-${index}`; button.type = 'button'; button.tabIndex = -1;
            button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(selected === index));
            button.setAttribute('aria-label', item.title);
            const icon = document.createElement('span'); icon.className = 'slash-icon'; icon.textContent = item.icon; icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = item.title;
            const description = document.createElement('small'); description.textContent = item.description; text.append(title, description);
            button.append(icon, text);
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', () => props.command(item));
            menu!.append(button);
            if (index === selected) { selectedTitle = item.title; editorDom?.setAttribute('aria-activedescendant', button.id); }
          });
          reposition();
          menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
        };
        const cleanup = () => {
          activeEditor?.off('blur', blur); activeEditor = undefined;
          menu?.remove(); menu = undefined; current = undefined;
          editorDom?.removeAttribute('aria-controls'); editorDom?.removeAttribute('aria-activedescendant'); editorDom?.removeAttribute('aria-expanded');
          window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true);
        };
        return {
          onStart(props) {
            selected = 0; selectedTitle = undefined;
            menu = document.createElement('div'); menu.id = listId; menu.className = 'slash-menu';
            menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'Insert component');
            document.body.append(menu); editorDom = props.editor.view.dom;
            activeEditor = props.editor; activeEditor.on('blur', blur);
            editorDom.setAttribute('aria-controls', listId); editorDom.setAttribute('aria-expanded', 'true');
            window.addEventListener('resize', reposition); document.addEventListener('scroll', reposition, true); paint(props);
          },
          onUpdate(props) {
            const previous = props.items.findIndex(item => item.title === selectedTitle);
            selected = previous < 0 ? 0 : previous; paint(props);
          },
          onKeyDown({ event, view }) {
            if (event.key === 'Escape') { exitSuggestion(view, key); return true; }
            if (!current) return false;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              selected = current.items.length ? (selected + (event.key === 'ArrowDown' ? 1 : -1) + current.items.length) % current.items.length : 0;
              paint(current); return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              const item = current.items[selected]; if (item) current.command(item); return true;
            }
            return false;
          },
          onExit: cleanup,
        };
      },
    })];
  },
});
