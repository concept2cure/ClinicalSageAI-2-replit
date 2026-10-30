"""Run only the existing bounded editor/UI/size gates, retaining all exits."""
import json
import subprocess
import sys

gates = ['ci:single-native-canvas', 'ci:canvas-path', 'ci:check-editor-integrity',
         'ci:design-system', 'ci:check-shell-css-collisions', 'ci:surface-text-ramp',
         'audit:repo-health:ceiling']
results = []
for gate in gates:
    print(json.dumps({'gate': gate, 'event': 'start'}), flush=True)
    result = subprocess.run(['npm', 'run', '--silent', gate], check=False)
    results.append({'gate': gate, 'exitCode': result.returncode})
print(json.dumps({'results': results}), flush=True)
sys.exit(1 if any(row['exitCode'] for row in results) else 0)
