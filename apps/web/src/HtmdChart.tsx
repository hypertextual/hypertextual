import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from '@helical/chart';

export interface ChartSpec { version: 1; type: 'bar'; title: string; labels: string[]; series: { name: string; values: number[] }[] }
export const defaultChartSource = JSON.stringify({ version: 1, type: 'bar', title: 'Weekly notes', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [{ name: 'Notes', values: [4, 7, 3, 9, 6] }] }, null, 2);
export function parseChart(source: string): ChartSpec {
  const data = JSON.parse(source) as ChartSpec;
  const text = (value: unknown, max: number) => typeof value === 'string' && [...value].length > 0 && [...value].length <= max;
  const allowed = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
  if (!data || typeof data !== 'object' || !allowed(data, ['version', 'type', 'title', 'labels', 'series']) || data.version !== 1 || data.type !== 'bar') throw Error('Expected an HTMD v1 bar chart');
  if (!text(data.title, 160)) throw Error('Chart title must contain 1–160 characters');
  if (!Array.isArray(data.labels) || data.labels.length < 1 || data.labels.length > 24 || !data.labels.every(label => text(label, 80))) throw Error('Chart must contain 1–24 labels of 1–80 characters');
  if (!Array.isArray(data.series) || data.series.length < 1 || data.series.length > 5) throw Error('Chart must contain 1–5 series');
  for (const series of data.series) {
    if (!series || typeof series !== 'object' || !allowed(series, ['name', 'values']) || !text(series.name, 80) || !Array.isArray(series.values) || series.values.length !== data.labels.length || !series.values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw Error('Each named series needs one finite, nonnegative value per label');
  }
  return data;
}
function ChartView({ node, selected, editor, getPos, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => { try { return { spec: parseChart(node.attrs.source) }; } catch (error) { return { error: String(error) }; } }, [node.attrs.source]);
  const open = () => { setDraft(node.attrs.source); setError(''); setEditing(true); };
  useEffect(() => {
    const onEdit = (event: Event) => { if ((event as CustomEvent<number>).detail === getPos()) open(); };
    editor.view.dom.addEventListener('htmd-edit-chart', onEdit);
    return () => editor.view.dom.removeEventListener('htmd-edit-chart', onEdit);
  }, [editor, getPos, node.attrs.source]);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const spec = parsed.spec;
  const data = useMemo(() => spec?.labels.map((label, index) => Object.fromEntries([['label', label], ...spec.series.map((series, i) => [`series${i}`, series.values[index]])])), [spec]);
  const series = useMemo(() => spec?.series.map((series, i) => ({ key: `series${i}`, label: series.name })), [spec]);
  return <NodeViewWrapper className={`htmd-chart${selected ? ' selected' : ''}`} data-htmd-chart="true" contentEditable={false}>
    <figure aria-label={spec?.title ?? 'Invalid HTMD chart'}>
      <figcaption><strong>{spec?.title ?? 'Invalid HTMD chart'}</strong><button onClick={open}>Edit chart data</button></figcaption>
      {spec && data && series ? <Chart type="bar" data={data} series={series} xKey="label" height={260} showLegend showGrid showAxis /> : <p role="alert">{parsed.error}</p>}
    </figure>
    {editing && <div className="chart-data-editor" role="dialog" aria-label="Edit chart data">
      <label>Chart data<textarea ref={input} aria-label="Chart JSON" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { setEditing(false); editor.commands.focus(); } }} /></label>
      {error && <p role="alert">{error}</p>}
      <div><button onClick={() => { try { parseChart(draft); updateAttributes({ source: draft }); setEditing(false); editor.commands.focus(); } catch (error) { setError(String(error)); } }}>Apply chart</button><button onClick={() => { setEditing(false); editor.commands.focus(); }}>Cancel</button></div>
    </div>}
  </NodeViewWrapper>;
}

export const HtmdChart = Node.create({
  name: 'htmdChart', priority: 200, group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ source: { default: defaultChartSource } }),
  parseHTML: () => [{ tag: '[data-htmd-chart]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-htmd-chart': 'true' })],
  markdownTokenName: 'code',
  parseMarkdown: (token, helpers) => token.lang === 'htmd:chart' ? helpers.createNode('htmdChart', { source: token.text ?? '' }) : [],
  renderMarkdown: node => `\`\`\`htmd:chart\n${node.attrs?.source ?? ''}\n\`\`\``,
  addNodeView: () => ReactNodeViewRenderer(ChartView),
  addKeyboardShortcuts() { return { 'Mod-Enter': () => {
    const selection = this.editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'htmdChart') return false;
    this.editor.view.dom.dispatchEvent(new CustomEvent('htmd-edit-chart', { detail: selection.from })); return true;
  } }; },
});
