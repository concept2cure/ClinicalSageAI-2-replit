
import re, sys, os, subprocess, collections
plan = open(sys.argv[1], encoding='utf-8').read()
text = plan[plan.find('# Appendix A'):]
files = [f for f in subprocess.run(['git','ls-files'], capture_output=True, text=True).stdout.split('\n') if f]
by_base = collections.defaultdict(list)
for f in files: by_base[os.path.basename(f)].append(f)
EXT = r'(?:tsx|ts|mts|mjs|js|json|sql|tfvars|tf|yml|yaml|md|hcl|sh|py|txt|html)'
pat = re.compile(r'((?:[A-Za-z0-9_.@-]+/)*[A-Za-z0-9_.@-]+\.' + EXT + r')\b(?::(\d+(?:[-–,]\d+)*))?')
OVERRIDE = {
 'auth.ts':'server/routes/auth.ts', 'tools/index.ts':'server/services/tools/index.ts', 'api-keys.ts':'server/routes/api-keys.ts',
 'index.ts':'server/index.ts', 'c2c-agent.yml':'.github/workflows/c2c-agent.yml', 'tenantContext.ts':'server/middleware/tenantContext.ts',
 'index.html':'client/index.html', 'DEPENDENCIES.md':'docs/security/DEPENDENCIES.md', 'mcp/tools/runtime.ts':'server/mcp/tools/runtime.ts',
 'authService.tsx':'client/src/services/portal/authService.tsx', 'AdminSurfaces.tsx':'client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx',
 'Part11Console.tsx':'client/src/concept2cure/v2/surfaces/Part11Console.tsx', 'sign-ceremony-baseline.json':'scripts/ci/sign-ceremony-baseline.json',
 'purge-coverage-baseline.json':'docs/reports/purge-coverage-baseline.json', 'dependency-risk-ledger.json':'docs/security/dependency-risk-ledger.json',
 'environment.ts':'server/config/environment.ts', 'env.ts':'server/startup/env.ts', 'main.tf':'terraform/stack/main.tf',
}
SKIP = {'security.txt','package.json','.source.json','terraform.tfvars','README.md','CLAUDE.md','AGENTS.md','SECURITY.md'}
seen = collections.OrderedDict()
for m in pat.finditer(text):
    key=(m.group(1), m.group(2) or ''); seen[key]=seen.get(key,0)+1
rows=[]; c=collections.Counter()
for (path, lines), n in seen.items():
    if os.path.basename(path) in SKIP and not os.path.isfile(path): continue
    resolved = path if os.path.isfile(path) else OVERRIDE.get(path)
    if not resolved:
        base=os.path.basename(path)
        cands=[f for f in by_base.get(base,[]) if f.endswith('/'+path) or f==path] or by_base.get(base,[])
        cands=[f for f in cands if '/__tests__/' not in f and '/_legacy/' not in f and not f.startswith('docs/audit-2026-07')] or cands
        if len(cands)==1: resolved=cands[0]
        elif cands:
            def score(f):
                a=path.split('/'); b=f.split('/'); s=0
                for x,y in zip(reversed(a),reversed(b)):
                    if x==y: s+=1
                    else: break
                return s
            best=sorted(cands,key=lambda f:(-score(f),len(f))); resolved=best[0]
            rows.append(f'AMBIGUOUS     {path}:{lines} -> {best[0]} (of {len(cands)})'); c['ambiguous']+=1
    if not resolved or not os.path.isfile(resolved):
        rows.append(f'MISSING-FILE  {path}:{lines}'); c['missing']+=1; continue
    if not lines:
        rows.append(f'OK            {resolved}'); c['ok']+=1; continue
    src=open(resolved,encoding='utf-8',errors='replace').read().split('\n')
    first=int(re.split(r'[-–,]',lines)[0])
    if first>len(src):
        rows.append(f'OUT-OF-RANGE  {resolved}:{lines} (file has {len(src)} lines)'); c['oor']+=1; continue
    rows.append(f'OK            {resolved}:{lines}  | {src[first-1].strip()[:110]}'); c['ok']+=1
head=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True).stdout.strip()
hdr=f"# Citation check of the audit appendices at commit {head}\n# Method: every path[:line] token in the three auditor reports resolved against git ls-files; the cited first line is printed so a reader can judge whether it still says what the finding says.\n# Legend: OK = file exists and line in range (text shown); AMBIGUOUS = bare filename matched several files, best-suffix match chosen; OUT-OF-RANGE / MISSING-FILE = citation corrected in the report.\n\n"
open(sys.argv[2],'w').write(hdr+'\n'.join(rows)+f"\n\nSUMMARY: {dict(c)}; {sum(c.values())} citations checked\n")
print(f"SUMMARY: {dict(c)}")
