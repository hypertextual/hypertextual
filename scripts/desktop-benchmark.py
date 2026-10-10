"""Release-only macOS measurements. All interaction writes go to temporary vaults.
Run after building release binaries, web assets, and the unsigned Tauri app.
Raw samples are retained; no development server or browser IPC substitution.
"""
import argparse
import ctypes
import gzip
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import struct
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'artifacts/performance'
LIBPROC = ctypes.CDLL('/usr/lib/libproc.dylib')
LIBPROC.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
class MachTimebase(ctypes.Structure):
    _fields_ = [('numer', ctypes.c_uint32), ('denom', ctypes.c_uint32)]
TIMEBASE = MachTimebase()
ctypes.CDLL('/usr/lib/libSystem.B.dylib').mach_timebase_info(ctypes.byref(TIMEBASE))
CPU_SCALE = TIMEBASE.numer / TIMEBASE.denom

def process_usage(pid):
    buffer = ctypes.create_string_buffer(512)
    if LIBPROC.proc_pid_rusage(pid, 4, buffer) != 0:
        return None
    values = struct.unpack_from('8Q', buffer, 16)
    return {'pid': pid, 'cpu_ns': int((values[0] + values[1]) * CPU_SCALE), 'rss_bytes': values[6], 'footprint_bytes': values[7]}

def webkit_processes():
    result = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True)
    return {int(line.split()[0]): line.split(None, 1)[1] for line in result.splitlines() if '/WebKit.framework/' in line}

def cpu_percent(start, end):
    initial={p['pid']:p['cpu_ns'] for p in start['processes']}
    delta=sum(p['cpu_ns']-initial[p['pid']] for p in end['processes'] if p['pid'] in initial)
    return delta / (end['at']-start['at']) / 1e7

def percentile(values, percent):
    return sorted(values)[max(0, math.ceil(len(values) * percent) - 1)]

def summary(values):
    return {'n': len(values), 'median_ms': statistics.median(values), 'p95_ms': percentile(values, .95), 'max_ms': max(values)}

def fixture(directory):
    directory.mkdir()
    (directory / 'Welcome.htmd').write_text('A small note to start the comparison.\n')
    for count in (100, 1000, 5000):
        (directory / f'{count}.htmd').write_text(''.join(f'Paragraph {i + 1}: **bold**, *emphasis*, and `code`. Café 🦀.\n\n' for i in range(count)))
    shutil.copyfile(ROOT / 'vault/Examples/Chart.htmd', directory / 'Chart.htmd')

def actions(framework):
    # Row centers include the macOS title bar; both shells are 1240x840 content.
    top, stride = (155, 38) if framework == 'gpui' else (169, 36)
    result = [{'kind':'idle', 'label':'welcome', 'seconds':3}]
    for index, label in enumerate(('100', '1000', '5000', 'Chart')):
        result += [{'kind':'click','label':'open_'+label,'x':130,'y':top+stride*index}, {'kind':'idle','label':label,'seconds':2}, {'kind':'screenshot','label':label}]
        if label == 'Chart':
            continue
        # Focus the document without changing it, then move to its first byte.
        result += [{'kind':'focus','label':'focus_'+label,'x':600,'y':170}, {'kind':'key','label':'home_'+label,'code':126,'command':True}]
        result += [{'kind':'type','label':'typing_'+label,'text':'Measured typing, bold and plain. '}]
        for j in range(24):
            result += [{'kind':'key','label':'navigation_'+label,'code':125 if j % 2 == 0 else 126}]
        for j in range(12):
            result += [{'kind':'scroll','label':'scroll_'+label,'code':0 if j % 2 == 0 else 1}]
    return result

def run(framework, binary, trial, driver, directory):
    vault = directory / f'{framework}-{trial}'
    fixture(vault)
    plan = vault / 'plan.json'; plan.write_text(json.dumps({'binary':str(binary),'vault':str(vault),'actions':actions(framework)}))
    baseline = webkit_processes()
    process = subprocess.Popen([str(driver),str(plan)], stdout=subprocess.PIPE, stderr=open(vault/'driver.log','w'), text=True)
    records, resources, helpers, pid = [], [], {}, None
    spans = {}
    for line in process.stdout:
        record = json.loads(line); records.append(record)
        if record['kind'] == 'launch': pid = record['pid']
        if record['kind'] == 'startup' and framework == 'tauri': helpers = {p:name for p,name in webkit_processes().items() if p not in baseline}
        pids = [pid] + list(helpers) if pid else []
        usage = [value for p in pids if (value := process_usage(p))]
        sample = {'label':record.get('label',record['kind']), 'phase':record['kind'],'at':time.monotonic(),'processes':usage,
                  'footprint_bytes':sum(p['footprint_bytes'] for p in usage),'rss_bytes':sum(p['rss_bytes'] for p in usage),'cpu_ns':sum(p['cpu_ns'] for p in usage)}
        resources.append(sample)
        label = record.get('label','')
        if record['kind'] in ('idle_start','action_start'): spans[label] = sample
        if record['kind'] == 'idle_end':
            start = spans[label]; sample['cpu_percent'] = cpu_percent(start,sample)
            print(f'{framework} trial {trial}: {label}: footprint {sample["footprint_bytes"]/2**20:.1f} MiB, idle CPU {sample["cpu_percent"]:.1f}%',flush=True)
    exit_code = process.wait()
    data = {'framework':framework,'trial':trial,'pid':pid,'helpers':helpers,'exit_code':exit_code,'records':records,'resources':resources}
    (ARTIFACTS/f'{framework}-{trial}.json').write_text(json.dumps(data,indent=2))
    for path in vault.glob('*.png'): shutil.copyfile(path,ARTIFACTS/f'{framework}-{trial}-{path.name}')
    if exit_code:
        raise RuntimeError(f'Driver failed; inspect {vault}/driver.log and retained raw samples')
    # Switching notes autosaves. Verify that real native input reached their files.
    for count in (100,1000,5000):
        source = (vault/f'{count}.htmd').read_text()
        if 'Measured typing, bold and plain. ' not in source: raise RuntimeError(f'{framework}: lost native typing in {count}')
    return data

def aggregate(runs):
    result = {}
    for framework in ('gpui','tauri'):
        selected = [r for r in runs if r['framework']==framework]
        if not selected: continue
        result[framework] = {'startup':summary([record['ms'] for r in selected for record in r['records'] if record['kind']=='startup'])}
        for label in ('100','1000','5000','Chart'):
            case = {}
            for kind in ('open','typing','navigation','scroll'):
                values = [record['ms'] for r in selected for record in r['records'] if record.get('label')==kind+'_'+label and record.get('ok')]
                if values: case[kind] = summary(values)
            idle = [s for r in selected for s in r['resources'] if s['phase']=='idle_end' and s['label']==label]
            case['settled_footprint_mib'] = statistics.median([s['footprint_bytes']/2**20 for s in idle])
            case['settled_rss_mib'] = statistics.median([s['rss_bytes']/2**20 for s in idle])
            case['idle_cpu_percent'] = statistics.median([s['cpu_percent'] for s in idle])
            active = [s['footprint_bytes']/2**20 for r in selected for s in r['resources'] if s['label'] in (label,'open_'+label,'focus_'+label,'home_'+label,'typing_'+label,'navigation_'+label,'scroll_'+label)]
            case['sampled_peak_footprint_mib'] = max(active)
            for phase in ('typing','navigation','scroll'):
                cpu=[]
                for r in selected:
                    span=[s for s in r['resources'] if s['label']==phase+'_'+label]
                    if len(span)>1: cpu.append(cpu_percent(span[0],span[-1]))
                if cpu: case[phase+'_cpu_percent'] = statistics.median(cpu)
            result[framework][label] = case
        result[framework]['capture_overhead'] = [record for r in selected for record in r['records'] if record['kind']=='capture_overhead']
    return result

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--trials',type=int,default=3); parser.add_argument('--framework',choices=['gpui','tauri','both'],default='both'); args=parser.parse_args()
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    driver=ROOT/'target/native-benchmark'
    subprocess.run(['swiftc','-O',str(ROOT/'scripts/native-benchmark.swift'),'-o',str(driver)],check=True)
    temp=Path(tempfile.mkdtemp(prefix='htmd-release-benchmark-'))
    binaries={'gpui':ROOT/'target/release/htmd-gpui','tauri':ROOT/'target/release/htmd-tauri'}
    # Alternate order to reduce a simple warm-cache / order advantage.
    runs=[]
    for trial in range(1,args.trials+1):
        for framework in (('gpui','tauri') if trial%2 else ('tauri','gpui')):
            if args.framework not in ('both',framework): continue
            runs.append(run(framework,binaries[framework],trial,driver,temp))
    result={'machine':subprocess.check_output(['sysctl','-n','hw.model'],text=True).strip(),'os':subprocess.check_output(['sw_vers','-productVersion'],text=True).strip(),
            'profile':'cargo release; embedded production web assets; HTMD_BENCH marker only; no Vite server','fixture_vaults':str(temp),
            'trials_per_framework':args.trials, 'cpu_timebase':{'numer':TIMEBASE.numer,'denom':TIMEBASE.denom},
            'metric':'CGEvent posting to changed marker observed with CGWindowListCreateImage; includes capture overhead; not physical key-to-photon',
            'memory':'sum of proc_pid_rusage v4 physical footprints; Tauri includes fresh WebContent/GPU/Networking helpers identified at launch; RSS also retained',
            'results':aggregate(runs)}
    (ARTIFACTS/'desktop-summary.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
