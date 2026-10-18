from pathlib import Path
import json
import os
import subprocess

repo=Path('/workspace/ClinicalSageAI-2-replit')
folder=Path('/tmp/fa39-migration-header-followup')
published='fa39bd5d8cd5641a6dc0d5b573c145f4e17731cd'
base=subprocess.check_output(['git','rev-parse',published+'^'],cwd=repo,text=True).strip()
changed=subprocess.check_output(['git','diff','--name-only',base+'...'+published,'--','db/migrations/*.sql','migrations/*.sql'],cwd=repo,text=True).splitlines()
expected=['db/migrations/20260314_phase12_multi_user_review.sql','db/migrations/20260401_project_sharing_visibility.sql','migrations/20260928_platform_role_grants_platform_writes.sql']
assert changed==expected
gate='scripts/ci/require-migration-headers.sh'
gatebytes=subprocess.check_output(['git','show',published+':'+gate],cwd=repo)
assert (repo/gate).read_bytes()==gatebytes
for phase in ('original','current'):
    stage=folder/phase
    for path in changed:
        target=stage/path;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(subprocess.check_output(['git','show',published+':'+path],cwd=repo) if phase=='original' else (repo/path).read_bytes())
    (stage/'require-migration-headers.sh').write_bytes(gatebytes)

# Redirect only the symbolic BASE/HEAD resolution used by the unchanged gate.
# File names and original commit identities come from real git reads of the
# actual published range. No repository refs/index/worktree or guard is changed.
bindir=folder/'scope-bin';bindir.mkdir(exist_ok=True)
wrapper=bindir/'git'
wrapper.write_text(f'''#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == 'rev-parse --verify HEAD~1' ]]; then
  exec /usr/bin/git -C '{repo}' rev-parse --verify '{base}'
fi
if [[ "${{1:-}}" == diff && "${{2:-}}" == --name-only && "${{3:-}}" == HEAD~1...HEAD ]]; then
  shift 3
  exec /usr/bin/git -C '{repo}' diff --name-only '{base}...{published}' "$@"
fi
exec /usr/bin/git -C '{repo}' "$@"
''')
wrapper.chmod(0o700)
env=dict(os.environ);env['GITHUB_BASE_REF']='';env['PATH']=str(bindir)+':'+env.get('PATH','')
results=[]
for phase,wanted in [('original',1),('current',0)]:
    with (folder/f'header-{phase}.txt').open('wb') as log:
        result=subprocess.run(['bash','require-migration-headers.sh'],cwd=folder/phase,env=env,stdout=log,stderr=subprocess.STDOUT)
    results.append({'phase':phase,'exit':result.returncode})
    assert result.returncode==wanted,(phase,result.returncode)
(folder/'gate-scope.json').write_text(json.dumps({'publishedHead':published,'actualBase':base,'actualChangedMigrationPaths':changed,
    'gateBytesUnchangedFromPublished':True,'scopeMethod':'Private wrapper resolves only the symbolic published range and forwards actual git reads; unchanged gate validates copied published-original versus copied current file bytes. No branch/ref/index/worktree mutation or fabricated file list.','results':results},indent=2)+'\n')
print('Unchanged gate over actual published three-migration scope:',results)
