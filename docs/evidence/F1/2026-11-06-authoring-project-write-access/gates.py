"""Run existing design/editor/source gates, preserving every result."""
import json,subprocess,sys
names=['ci:one-product','ci:one-design-plan:selftest','ci:canvas-path','ci:canvas-path:selftest','ci:check-editor-integrity','ci:design-system','ci:check-shell-css-collisions','ci:surface-text-ramp','ci:launch-scope-api','ci:lineage-save-gate']
results=[]
for name in names:
 print(json.dumps({'gate':name,'event':'start'}),flush=True)
 result=subprocess.run(['npm','run','--silent',name],check=False)
 results.append({'gate':name,'exitCode':result.returncode})
print(json.dumps({'results':results}),flush=True)
sys.exit(1 if any(row['exitCode'] for row in results) else 0)
