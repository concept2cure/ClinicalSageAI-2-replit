"""Run the unchanged canonical hook while Git authentication is unavailable.

This performs validation only. It neither uploads objects nor moves a ref; a
later authenticated publication still uses the normal Git push and its hook.
"""
import os
from pathlib import Path
import subprocess
import sys

repo = Path(__file__).resolve().parents[4]
def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()
assert git('branch', '--show-current') == 'concept2cure-v2'
head = git('rev-parse', 'HEAD')
base = git('rev-parse', 'origin/concept2cure-v2')
env = os.environ.copy()
for key in list(env):
    if key.startswith(('HUSKY', 'SKIP_')) or key in ['ALLOW_NON_CANONICAL_PUSH', 'TYPECHECK_FILES_PER_PROCESS']:
        env.pop(key, None)
env['TYPECHECK_HEAP_MB'] = '12288'
if Path('/workspace/scratch/node22/bin/node').exists():
    env['PATH'] = '/workspace/scratch/node22/bin:' + env['PATH']
refs = f'refs/heads/concept2cure-v2 {head} refs/heads/concept2cure-v2 {base}\n'
result = subprocess.run(['sh', '.husky/pre-push'], cwd=repo, env=env, input=refs, text=True)
sys.exit(result.returncode)
