import json, sys, re, os, subprocess
root = os.getcwd(); S = sys.argv[1]
routes = [r for r in json.load(open(S + '/full-routes.json')) if r['path'].startswith('/api')]
files = subprocess.run(['bash','-lc',"find client/src shared -name '*.ts' -o -name '*.tsx' | grep -v __tests__ | grep -v '\\.test\\.'"],capture_output=True,text=True).stdout.split()
lit = re.compile(r"`([^`]*)`|'([^'\n]*)'|\"([^\"\n]*)\"")
pats = {}
for f in files:
    src = open(f, encoding='utf-8', errors='ignore').read()
    for m in lit.finditer(src):
        s = m.group(1) if m.group(1) is not None else (m.group(2) if m.group(2) is not None else m.group(3))
        if '/' not in s: continue
        s = re.sub(r'\$\{[^}]*\}', '\x00', s).split('?')[0].strip()
        segs = [x for x in re.split(r'/', s.replace('\x00','')) if x and re.match(r'^[A-Za-z][\w.-]*$', x)]
        if '/api/' not in s and not (s.startswith('/') or s.startswith('\x00/')): continue
        if '/api/' not in s and len(segs) < 2: continue
        rx = ''.join('.+' if c == '\x00' else re.escape(c) for c in re.split(r'(\x00)', s) if c != '')
        pats.setdefault(rx, set()).add(f)
comp = [(re.compile(rx + r'/?$'), rx) for rx in pats]
def sample(p): return re.sub(r':[A-Za-z_]\w*\??', 'P1', p).replace('*splat','P1/P2').replace('(.*)','P1')
res = []
for r in routes:
    smp = sample(r['path'])
    hit = None
    for c, rx in comp:
        # client pattern must match the route sample exactly, or end-anchored within it after /api
        if c.fullmatch(smp) or (rx.startswith('.+') and c.search(smp)):
            hit = rx; break
    res.append({**r, 'caller': sorted(pats[hit])[:3] if hit else None})
json.dump(res, open(S + '/matched.json','w'), indent=0)
unc = [r for r in res if not r['caller']]
print('api handlers', len(res), 'with a client caller', len(res)-len(unc), 'without', len(unc))
