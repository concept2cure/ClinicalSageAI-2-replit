import os,re,sys,json
root='<repo>'
Q=sys.argv[1]
tests=[l.strip() for l in open(Q+'/all-unit-files.txt') if l.strip()]
imp_re=re.compile(r"""(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]""")
mock_re=re.compile(r"""vi\.mock\(\s*['"]([^'"]+)['"]""")
def norm(p):
    p=re.sub(r'\.(m?[jt]sx?)$','',p)
    if p.endswith('/index'): p=p[:-6]
    return p
imported={}  # src -> set(tests)
for t in tests:
    fp=os.path.join(root,t)
    try: s=open(fp,encoding='utf8',errors='ignore').read()
    except: continue
    d=os.path.dirname(t)
    mocks=set()
    for m in mock_re.findall(s):
        if m.startswith('.'): mocks.add(norm(os.path.normpath(os.path.join(d,m))))
    for m in imp_re.findall(s):
        if m.startswith('.'):
            r=norm(os.path.normpath(os.path.join(d,m)))
        elif m.startswith('@/'):
            r=norm('client/src/'+m[2:])
        elif m.startswith('@shared/'):
            r=norm('shared/'+m[8:])
        else: continue
        if r in mocks: continue
        imported.setdefault(r,set()).add(t)
dirs=['server/services/vault','server/services/authoring','server/services/ectd','server/services/submission-service','server/services/submission-readiness','server/services/submission-gateways','server/services/part11','server/services/qms','server/services/projects','server/services/signature','server/mcp']
routes=[l.strip() for l in open(Q+'/launch-routes.txt') if l.strip()]
res={}
def walk(d):
    for dp,dn,fn in os.walk(os.path.join(root,d)):
        if '__tests__' in dp or 'fixtures' in dp: continue
        for f in fn:
            if re.search(r'\.(ts|tsx|js|mjs)$',f) and not re.search(r'\.(test|spec|dbtest)\.',f) and not f.endswith('.d.ts'):
                yield os.path.relpath(os.path.join(dp,f),root)
out=[]
for d in dirs:
    files=list(walk(d))
    hit=[f for f in files if norm(f) in imported]
    out.append((d,len(files),len(hit)))
    for f in files:
        if norm(f) not in imported: res.setdefault(d,[]).append(f)
rh=[r for r in routes if norm(r) in imported]
out.append(('launch routes (server/routes/*)',len(routes),len(rh)))
for d,n,h in out: print(f"{d}: {h}/{n} source files directly imported (unmocked) by >=1 test ({(100*h/n if n else 0):.0f}%)")
json.dump({k:v for k,v in res.items()},open(Q+'/untested-launch-files.json','w'),indent=1)
print('untested routes:',[r for r in routes if norm(r) not in imported])
