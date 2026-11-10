import json, sys, glob, re, os
d = json.load(open(glob.glob(sys.argv[1] + '/routes.*.json')[0]))
routers = {r['id']: r for r in d['routers']}
children = {}
childset = set()
for e in d['edges']:
    children.setdefault(e['parent'], []).append(e)
    childset.add(e['child'])
roots = [i for i in routers if i not in childset]
def join(a, b):
    if b in ('/', ''): return a or '/'
    return (a.rstrip('/') + '/' + b.lstrip('/')) if a else b
out = []
seen = set()
def walk(rid, prefix, depth, chain):
    if depth > 12 or (rid, prefix) in seen: return
    seen.add((rid, prefix))
    r = routers[rid]
    for rt in r['routes']:
        full = join(prefix, rt['path'])
        for m in rt['methods']:
            if m == '_all': m = 'ALL'
            out.append({'method': m.upper(), 'path': full, 'file': r['file'] or chain})
    for e in children.get(rid, []):
        p = e['path'] if not e['path'].startswith('/^') else '/<regex>'
        walk(e['child'], join(prefix, p), depth + 1, routers[rid]['file'] or chain)
for rid in roots: walk(rid, '', 0, None)
# de-dup
uniq = {}
for o in out:
    uniq[(o['method'], o['path'])] = o
out = sorted(uniq.values(), key=lambda o: (o['path'], o['method']))
json.dump(out, open(sys.argv[1] + '/full-routes.json', 'w'), indent=0)
api = [o for o in out if o['path'].startswith('/api')]
print('mounted handlers:', len(out), ' under /api:', len(api))
