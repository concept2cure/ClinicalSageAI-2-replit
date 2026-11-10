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
# Second pass (2026-11-01, CHANGELOG-template-callers.md): URLs assembled from path constants.
# method/resolve.cjs evaluates every template and `+` chain with the TypeScript parser, substituting
# constants (same file or imported), object properties and helper returns, and writes
# resolved-patterns.json. A route the literal pass found keeps that caller; only a route it missed
# is tested here, and more strictly than the literal pass:
#   - a resolved pattern must start with /api/<literal segment>, so a wildcard never stands for
#     the mount root;
#   - a wildcard stands for a route parameter: it matches a :param (or *splat) in the route's
#     sample, never a literal segment and never more than one parameter. So `'/api/x/' + id` is
#     not read as a call to every route under /api/x/:id/…, and `/api/seq/${id}/${kind}` with a
#     runtime `kind` is not read as a call to every action route; those stay with match2.py.
# The pattern must fullmatch the route's sample. `--probe-param-match` also lists the routes that
# a looser reading (the route's :param matching a literal client segment) would add. `--literal-only` skips this pass and reproduces
# inventory.before-template-callers.json.
# The HTTP method (second correction, 2026-11-01): resolve.cjs also says where each URL is sent and
# with which method (`sinks`). A route this pass finds is
#   exact     when a call sends its path with its method; callerAt is that call, builtAt where the
#             URL is assembled;
#   probable  when the path is built but no call with a known method sends it with this one, and
#             some call's method is not known (callMethod: unknown), so the row stays a lead;
#   not claimed when every call that sends the path uses another method: the row is left to
#             match2.py, as before the correction, with samePathAt / samePathMethods saying where
#             the client sends that path and how.
# The literal pass above does not compare methods (see the README's Limits).
RANK = {'template': 0, 'concatenation': 1, 'path-constant': 2}
rpats = {}
if '--literal-only' not in sys.argv[2:]:
    for o in json.load(open(S + '/resolved-patterns.json')):
        s = o['s'].split('?')[0].strip()
        if s.startswith('\x00/api/'): s = s[1:]  # an origin in front of the path
        if not re.match(r'^/api/[^/\x00]+', s): continue
        rx = ''.join('P1(?:/P2)?' if c == '\x00' else re.escape(c) for c in re.split(r'(\x00)', s) if c != '')
        e = rpats.setdefault(rx, {'s': s, 'sites': set()})
        sinks = tuple((k['file'], k['line'], tuple(k['methods']) if k['methods'] else None) for k in o.get('sinks', []))
        e['sites'].add((o['file'], o['line'], o['via'], '+'.join(o.get('how', [])), sinks))
rcomp = [(re.compile(rx + r'/?$'), e) for rx, e in rpats.items()]
def route_rx(p):
    parts = re.split(r'(:[A-Za-z_]\w*\??|\*splat|\(\.\*\))', p)
    return re.compile(''.join(('[^/]+' if x.startswith(':') else '.+') if (x.startswith(':') or x in ('*splat', '(.*)')) else re.escape(x) for x in parts if x) + r'/?$')
PROBE_B = '--probe-param-match' in sys.argv[2:]; probe_b = []
res = []
for r in routes:
    smp = sample(r['path'])
    hit = None
    for c, rx in comp:
        # client pattern must match the route sample exactly, or end-anchored within it after /api
        if c.fullmatch(smp) or (rx.startswith('.+') and c.search(smp)):
            hit = rx; break
    row = {**r, 'caller': sorted(pats[hit])[:3] if hit else None}
    if not hit and rcomp:
        rr = route_rx(r['path'])
        found = [e for c, e in rcomp if c.fullmatch(smp)]
        if PROBE_B and not found and any(rr.fullmatch(e['s'].replace('\x00', 'W')) for c, e in rcomp):
            probe_b.append((r['method'], r['path'], [(sorted(t[:4] for t in e['sites'])[0], e['s'].replace('\x00', '${…}')) for c, e in rcomp if rr.fullmatch(e['s'].replace('\x00', 'W'))][:2]))
        sites = set().union(*(e['sites'] for e in found)) if found else set()
        same, unknown, other = [], [], {}
        for t in sites:
            for kf, kl, km in t[4]:
                if km is None: unknown.append((RANK[t[2]], kf, kl, t))
                elif r['method'] == 'ALL' or r['method'] in km: same.append((RANK[t[2]], kf, kl, t))
                else: other.setdefault((kf, kl), set()).update(km)
            if not t[4]: unknown.append((RANK[t[2]], t[0], t[1], t))  # no call found for this URL
        if same or unknown:
            # the least machinery that finds it: a parsed template, then a + chain, then a constant
            pick = same or unknown
            best = min(pick, key=lambda c: (c[0], c[1], c[2], c[3][0], c[3][1]))
            t = best[3]
            pat = min((e['s'] for e in found if t in e['sites']), key=len)
            others = sorted({c[1] for c in pick} - {best[1]})
            row.update(caller=[best[1]] + others[:2], callerAt=f'{best[1]}:{best[2]}', builtAt=f'{t[0]}:{t[1]}', via=t[2], how=t[3],
                       pattern=pat.replace('\x00', '${…}'), sites=len({(c[1], c[2]) for c in pick}),
                       confidence='exact' if same else 'probable')
            if not same: row['callMethod'] = 'unknown'
        elif other:
            at = min(other)  # (file, line)
            row.update(samePathAt=f'{at[0]}:{at[1]}', samePathMethods=sorted(set().union(*other.values())))
    res.append(row)
json.dump(res, open(S + '/matched.json','w'), indent=0)
if PROBE_B: json.dump(probe_b, open(S + '/probe-param-match.json', 'w'), indent=1)
unc = [r for r in res if not r['caller']]
print('api handlers', len(res), 'with a client caller', len(res)-len(unc), 'without', len(unc),
      'of which found by the second pass', sum(1 for r in res if r.get('via')),
      '(exact', sum(1 for r in res if r.get('via') and r['confidence'] == 'exact'), 'probable', sum(1 for r in res if r.get('via') and r['confidence'] == 'probable'),
      ') and left to match2.py with the same path sent by another method', sum(1 for r in res if 'samePathAt' in r))
