# Second pass: a route the exact matcher missed counts as "probably called" when one client
# file names both its mount root (/api/<first>/<second?>) and its last literal segment as a
# path piece ('/<seg>' or '<seg>/'). Catches URLs built from a base constant plus a suffix.
import json, sys, re, subprocess
inv = sys.argv[1]
data = json.load(open(inv))
files = subprocess.run(['bash','-lc',"find client/src shared -name '*.ts' -o -name '*.tsx' | grep -v __tests__ | grep -v '\\.test\\.'"],capture_output=True,text=True).stdout.split()
srcs = {f: open(f, encoding='utf-8', errors='ignore').read() for f in files}
def lits(p): return [s for s in p.split('/') if s and not s.startswith(':') and not s.startswith('*') and s != 'api']
n = 0
for r in data['rows']:
    # a caller found by a pass keeps the confidence that pass gave it (the second pass of
    # match.py can find a path whose method it cannot read: probable); otherwise it is exact
    if r['caller']: r['confidence'] = r.get('confidence', 'exact'); continue
    L = lits(r['path'])
    if len(L) < 2: r['confidence'] = 'none'; continue
    root = '/api/' + L[0]
    last = L[-1]
    piece = re.compile(r"[/'\"`]" + re.escape(last) + r"(?:[/'\"`?]|$)")
    hit = next((f for f, s in srcs.items() if (root + '/' in s or root + "'" in s or root + '`' in s or root + '"' in s) and piece.search(s)), None)
    if hit:
        r['caller'] = hit; r['confidence'] = 'probable'; n += 1
    else:
        r['confidence'] = 'none'
json.dump(data, open(inv, 'w'), indent=0)
print('reclassified as probably called:', n)
