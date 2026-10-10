"""Plot the native benchmark results; requires matplotlib (optional)."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[1]
folder = root/'artifacts/performance'
results = json.loads((folder/'desktop-summary.json').read_text())['results']
sizes = json.loads((folder/'bundle-sizes.json').read_text())
fig, axes = plt.subplots(2, 2, figsize=(11, 7))
colors = {'tauri':'#7656c8','gpui':'#24988e'}
labels = ['100','1000','5000']
for framework, name in [('tauri','Tauri / WebKit'),('gpui','GPUI')]:
    data = results[framework]
    for ax, metric, title in [(axes[0,0],'typing','Typing p95 (ms)'),(axes[0,1],'open','Open median (ms)')]:
        key = 'p95_ms' if metric == 'typing' else 'median_ms'
        ax.plot(labels,[data[l][metric][key] for l in labels],marker='o',label=name,color=colors[framework]); ax.set_title(title); ax.set_xlabel('Rich paragraphs'); ax.grid(alpha=.2)
    ax=axes[1,0];ax.plot(labels,[data[l]['settled_footprint_mib'] for l in labels],marker='o',label=name,color=colors[framework]);ax.set_title('Settled process footprint (MiB)');ax.set_xlabel('Rich paragraphs');ax.grid(alpha=.2)
ax=axes[1,1]
for index, framework in enumerate(['tauri','gpui']):
    values=[sizes[framework]['app_bytes']/2**20,sizes[framework]['zip_bytes']/2**20]
    bars=ax.bar([index-.18,index+.18],values,width=.32,color=colors[framework],alpha=.9)
    for bar, value, kind in zip(bars,values,['App','ZIP']):ax.text(bar.get_x()+bar.get_width()/2,value+.3,f'{kind}\n{value:.2f}',ha='center',fontsize=9)
ax.set_xticks([0,1],['Tauri','GPUI']);ax.set_title('Stripped arm64 packages (MiB)');ax.set_ylim(0,22)
axes[0,0].set_ylim(bottom=0);axes[1,0].set_ylim(bottom=0)
axes[0,0].legend();fig.suptitle('Hypertextual native release PoC — M1 Pro / macOS 14.5',fontsize=14)
fig.text(.5,.015,'3 fresh-process trials • paced typing • latency includes compositor capture • Tauri memory includes WebKit helpers',ha='center',fontsize=9)
fig.tight_layout(rect=(0,.04,1,.96));fig.savefig(folder/'comparison.png',dpi=160)
