"""Measure consistent stripped, ad-hoc-signed arm64 macOS app packages.
Tauri input is the actual CLI-built .app; GPUI uses the minimal standard .app
layout because its assets are embedded in the executable. No vault is bundled.
"""
import gzip
import json
from pathlib import Path
import plistlib
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
output = root/'target/performance-bundles'; output.mkdir(parents=True,exist_ok=True)
results = {}
for framework in ('tauri','gpui'):
    app = output/f'Hypertextual-{framework}.app'
    if app.exists(): shutil.rmtree(app)
    original = root/f'target/release/htmd-{framework}'
    if framework == 'tauri': shutil.copytree(next((root/'target/release/bundle/macos').glob('*.app')),app)
    else:
        (app/'Contents/MacOS').mkdir(parents=True)
        shutil.copy2(original, app/'Contents/MacOS'/original.name)
        shutil.copytree(root/'apps/tauri/icons',app/'Contents/Resources')
        with (app/'Contents/Info.plist').open('wb') as file:
            plistlib.dump({'CFBundleExecutable':original.name,'CFBundleIdentifier':f'dev.hypertextual.poc.{framework}','CFBundleName':f'Hypertextual {framework}',
                          'CFBundlePackageType':'APPL','CFBundleVersion':'0.1.0','CFBundleShortVersionString':'0.1.0','NSHighResolutionCapable':True},file)
    binary = app/'Contents/MacOS'/original.name
    subprocess.run(['strip','-S','-x',str(binary)],check=True)
    subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
    archive = output/f'{app.name}.zip'
    subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(archive)],check=True)
    results[framework]={'release_executable_bytes':original.stat().st_size,'stripped_executable_bytes':binary.stat().st_size,
                        'app_bytes':sum(p.stat().st_size for p in app.rglob('*') if p.is_file()),'zip_bytes':archive.stat().st_size,
                        'app_path':str(app),'zip_path':str(archive)}
assets = list((root/'apps/web/dist').rglob('*'))
results['web'] = {'asset_bytes':sum(p.stat().st_size for p in assets if p.is_file()),'gzip_bytes':sum(len(gzip.compress(p.read_bytes(),mtime=0)) for p in assets if p.is_file()),
                  'files':{str(p.relative_to(root/'apps/web/dist')):p.stat().st_size for p in assets if p.is_file()}}
(root/'artifacts/performance').mkdir(parents=True,exist_ok=True)
(root/'artifacts/performance/bundle-sizes.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
