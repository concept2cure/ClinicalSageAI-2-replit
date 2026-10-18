import json, re, os, sys
ROOT='<repo>'
os.chdir(ROOT)
route_re = re.compile(r"""(?:router|r|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]""")
use_re = re.compile(r"""router\.use\(\s*(?:['"`]([^'"`]+)['"`]\s*,\s*)?(\w+)\s*\)""")
imp_re = re.compile(r"""import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]""")
def resolve(base, rel):
    p = os.path.normpath(os.path.join(os.path.dirname(base), rel))
    for cand in [p, p.replace('.js','.ts'), p+'.ts', p+'/index.ts']:
        if os.path.isfile(cand): return cand
    return None
def collect(f, prefix='', seen=None):
    seen = seen or set()
    if f in seen: return []
    seen.add(f)
    src = open(f).read()
    out = [(m.group(1).upper(), prefix + m.group(2)) for m in route_re.finditer(src)]
    imps = {m.group(1): m.group(2) for m in imp_re.finditer(src)}
    for m in use_re.finditer(src):
        sub_prefix, name = m.group(1) or '', m.group(2)
        if name in imps:
            r = resolve(f, imps[name])
            if r: out += collect(r, prefix + sub_prefix, seen)
    return out
def norm(p):
    p = re.sub(r':(\w+)(\([^)]*\))?\??', '{}', p)
    p = re.sub(r'\{[^}]+\}', '{}', p)
    return p.rstrip('/') or '/'
specs = [
 ('submission-center.openapi.json', '/api/submissions', ['server/routes/submissions.ts','server/routes/submission-sign-release.ts']),
 ('global-ri.openapi.json', '/api/global-ri', ['server/routes/global-ri.routes.ts']),
 ('ivd-platform.openapi.json', '', []),
]
for spec, mount, files in specs:
    d = json.load(open(spec))
    server = (d.get('servers') or [{'url':''}])[0]['url'].rstrip('/')
    routes = []
    for f in files: routes += collect(f, mount)
    if spec.startswith('ivd'):
        routes = collect('server/routes/ivd-lifecycle.ts', '/api/ivd-lifecycle') + collect('server/routes/ivd-knowledge.ts', '/api/ivd-knowledge')
    have = {(m, norm(p)) for m,p in routes}
    total=0; missing=[]
    for p, ops in d['paths'].items():
        full = server + p if server not in ('', '/') else p
        for m in ops:
            if m.lower() not in ('get','post','put','patch','delete'): continue
            total += 1
            if (m.upper(), norm(full)) not in have: missing.append(f'{m.upper()} {full}')
    spec_set = {(m.upper(), norm((server + p) if server not in ('','/') else p)) for p,ops in d['paths'].items() for m in ops if m.lower() in ('get','post','put','patch','delete')}
    undocumented = [f'{m} {p}' for m,p in sorted(have) if (m,p) not in spec_set]
    print(f'== {spec}: documented ops={total}, not found in code={len(missing)}, implemented-but-undocumented={len(undocumented)}')
    for x in missing[:15]: print('   MISSING', x)
