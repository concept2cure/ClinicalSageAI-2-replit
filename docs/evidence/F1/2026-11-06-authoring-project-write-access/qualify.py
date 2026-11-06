"""Serialize the final checks on the normally merged canonical source."""
import json,os,subprocess,sys
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
tests=json.loads((p/'regression-tests.json').read_text())+[
 'server/services/entitlements/__tests__/launch-reproof-narrowing.test.ts',
 'client/src/concept2cure/v2/__tests__/reviewThreadsReopen.test.tsx',
]
node_tests=[f'scripts/ci/__tests__/{name}.test.mjs' for name in [
 'lineage-save-gate-strings','lineage-authoring-transaction','lineage-request-transaction',
 'recorded-lineage-query-bindings','strip-comments',
]]
selected=json.loads((p/'prepublication-inputs.json').read_text())['selected']
helpers=[str(f.relative_to(r)) for f in p.iterdir() if f.suffix in ['.py','.mjs','.cjs']]
subprocess.run(['python3',str(p/'pin.py'),'integrated-inputs.json',*selected,*node_tests,*helpers],cwd=r,check=True)
env=os.environ.copy();env['C2C_SOURCE_FREEZE']='integrated-inputs.json'
jobs=[
 ('integrated-regression',['node_modules/.bin/vitest','run','--config','vitest.config.ts',*tests]),
 ('integrated-lineage',['node','--test','--test-concurrency=1',*node_tests]),
 ('integrated-gates',['python3',str(p/'gates.py')]),
 ('integrated-build',['npm','run','build']),
]
for label,argv in jobs:
 print(label,flush=True)
 result=subprocess.run(['python3',str(p/'check.py'),label,'--',*argv],cwd=r,env=env)
 if result.returncode:sys.exit(result.returncode)
