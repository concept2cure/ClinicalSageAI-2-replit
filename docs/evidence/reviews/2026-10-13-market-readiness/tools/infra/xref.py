import json,re,os,glob
pkg=json.load(open('package.json'))
scripts=pkg['scripts']
ci=[k for k in scripts if k.startswith('ci:')]
# corpus of invokers
invokers={}
for f in glob.glob('.github/workflows/*.yml')+['.husky/pre-push','.husky/pre-commit','dangerfile.js','Makefile']:
    if os.path.exists(f): invokers[f]=open(f).read()
def direct_refs(text):
    return set(re.findall(r'npm run(?: --silent| -s)? ([a-zA-Z0-9:_\-\.]+)',text))|set(re.findall(r'npm run-script ([a-zA-Z0-9:_\-\.]+)',text))
# direct invoked names
direct={}
for f,t in invokers.items():
    for n in direct_refs(t): direct.setdefault(n,set()).add(f)
# transitive via scripts
def expand(name,seen=None):
    seen=seen or set()
    if name in seen or name not in scripts: return seen
    seen.add(name)
    for n in direct_refs(scripts[name]): expand(n,seen)
    return seen
reached={}
for n,fs in direct.items():
    for m in expand(n):
        reached.setdefault(m,set()).update(fs)
# also scripts invoking node scripts/ci/X directly in workflows: map script command path -> name
cmd_hits={}
alltext='\n'.join(invokers.values())
for k in ci:
    if k in reached: continue
    cmd=scripts[k]
    m=re.search(r'(scripts/[\w/\-\.]+\.(?:mjs|js|ts|sh|cjs))',cmd)
    if m and m.group(1) in alltext:
        cmd_hits[k]=m.group(1)
dead=[k for k in ci if k not in reached and k not in cmd_hits]
by_pp=[k for k in ci if k in reached and '.husky/pre-push' in reached[k]]
by_wf=[k for k in ci if k in reached and any(f.startswith('.github') for f in reached[k])]
print('ci:* scripts:',len(ci))
print('reached via npm run (workflow or hook, transitively):',len([k for k in ci if k in reached]))
print('  of which pre-push:',len(by_pp),' workflows:',len(by_wf))
print('reached only via direct script-path invocation in workflow/hook:',len(cmd_hits))
print('NOT invoked anywhere (workflows, pre-push, pre-commit, danger, Makefile):',len(dead))
open('<scratch>/infra/dead-ci-scripts.txt','w').write('\n'.join(dead))
# also: invoked from other package scripts that are not ci:* but themselves not invoked? 
selftest=[k for k in dead if 'selftest' in k or 'self-test' in k or k.endswith(':write-baseline') or 'baseline' in k or k.endswith(':update') or k.endswith(':write')]
print('  of dead, selftest/baseline/writer helpers:',len(selftest))
print('  dead (non-helper):',len(dead)-len(selftest))
print('\n'.join(sorted(set(dead)-set(selftest))))
