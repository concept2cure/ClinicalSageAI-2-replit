#!/usr/bin/env python3
"""Cross-reference v2 client API calls against mounted server routes.

Static, regex-based approximation:
  * server: every `app.use('/prefix', ..., X)` / `{ path, router: X }` mount in
    server/**, X resolved via imports (static + `await import`) to a file; that
    file's `<ident>.<verb>('/path')` definitions are joined with the prefix,
    recursing through `<ident>.use('/sub', Y)` sub-mounts.
  * plus direct `app.<verb>('/api/...')` definitions anywhere under server/.
  * client: every string/template literal containing '/api/' in
    client/src/concept2cure/** (non-test), `${...}` -> :p, query stripped.
Over-approximates (all routers in a mounted file count), so NONE is a strong
signal; MATCH is not proof of behaviour.
"""
import os, re, sys, json
from collections import defaultdict

ROOT = '<repo>'
OUT = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {'node_modules', '__tests__', 'dist', '.git'}

def walk(base, exts):
    for d, dirs, files in os.walk(base):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if f.endswith(exts) and '.test.' not in f and '.spec.' not in f:
                yield os.path.join(d, f)

src_cache = {}
def read(p):
    if p not in src_cache:
        try:
            src_cache[p] = open(p, encoding='utf-8', errors='replace').read()
        except Exception:
            src_cache[p] = ''
    return src_cache[p]

NL = chr(10); BS = chr(92)
def lex(s):
    out = list(s); toks = []; i = 0; n = len(s); prev = ''
    while i < n:
        c = s[i]
        if c == '/' and i + 1 < n and s[i+1] == '/':
            j = s.find(NL, i); j = n if j == -1 else j
            for k in range(i, j): out[k] = ' '
            i = j; continue
        if c == '/' and i + 1 < n and s[i+1] == '*':
            j = s.find('*/', i + 2); j = n if j == -1 else j + 2
            for k in range(i, j):
                if out[k] != NL: out[k] = ' '
            i = j; continue
        if c in ('"', "'"):
            j = i + 1
            while j < n and s[j] != c and s[j] != NL:
                j += 2 if s[j] == BS else 1
            toks.append(('str', s[i+1:j], i, j + 1)); i = j + 1; prev = 'x'; continue
        if c == '`':
            j = i + 1; buf = []
            while j < n and s[j] != '`':
                if s[j] == BS: buf.append(s[j:j+2]); j += 2; continue
                if s[j] == '$' and j + 1 < n and s[j+1] == '{':
                    d = 1; j += 2
                    while j < n and d:
                        if s[j] == '{': d += 1
                        elif s[j] == '}': d -= 1
                        elif s[j] in ('"', "'", '`'):
                            q = s[j]; j += 1
                            while j < n and s[j] != q: j += 2 if s[j] == BS else 1
                        j += 1
                    buf.append('${}'); continue
                buf.append(s[j]); j += 1
            toks.append(('tpl', ''.join(buf), i, j + 1)); i = j + 1; prev = 'x'; continue
        if c == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^'):
            j = i + 1; cls = False
            while j < n and s[j] != NL:
                if s[j] == BS: j += 2; continue
                if s[j] == '[': cls = True
                elif s[j] == ']': cls = False
                elif s[j] == '/' and not cls: break
                j += 1
            if j < n and s[j] == '/':
                i = j + 1; prev = 'x'; continue
        if not c.isspace(): prev = c
        i += 1
    return ''.join(out), toks

def strip_comments(s):
    return lex(s)[0]

def resolve_spec(frm, spec):
    if not spec.startswith('.'):
        return None
    base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    cands = []
    b0 = re.sub(r'\.(js|mjs|cjs)$', '', base)
    for b in (base, b0):
        cands += [b, b + '.ts', b + '.tsx', b + '.js', b + '.mjs', b + '/index.ts', b + '/index.js']
    for c in cands:
        if os.path.isfile(c):
            return c
    return None

IMPORT_DEFAULT = re.compile(r'import\s+(\w+)\s*(?:,\s*\{([^}]*)\})?\s*from\s*[\'"]([^\'"]+)[\'"]')
IMPORT_NAMED = re.compile(r'import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]')
IMPORT_NS = re.compile(r'import\s*\*\s*as\s+(\w+)\s+from\s*[\'"]([^\'"]+)[\'"]')
DYN_CONST = re.compile(r'(?:const|let|var)\s+(\w+)\s*=\s*await\s+import\(\s*[\'"]([^\'"]+)[\'"]\s*\)')
DYN_DESTR = re.compile(r'(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*[\'"]([^\'"]+)[\'"]\s*\)')
DYN_PROMISE_ALL = re.compile(r'(?:const|let)\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(\s*\[([^\]]*)\]')

def imports_of(p):
    s = strip_comments(read(p))
    m = {}
    for a, named, spec in IMPORT_DEFAULT.findall(s):
        r = resolve_spec(p, spec)
        if r: m[a] = r
        if named:
            for part in named.split(','):
                part = part.strip().replace('type ', '')
                if not part: continue
                nm = part.split(' as ')[-1].strip()
                if r: m[nm] = r
    for named, spec in IMPORT_NAMED.findall(s):
        r = resolve_spec(p, spec)
        for part in named.split(','):
            part = part.strip().replace('type ', '')
            if not part: continue
            nm = part.split(' as ')[-1].strip()
            if r: m[nm] = r
    for a, spec in IMPORT_NS.findall(s):
        r = resolve_spec(p, spec)
        if r: m[a] = r
    for a, spec in DYN_CONST.findall(s):
        r = resolve_spec(p, spec)
        if r: m[a] = r
    for a, spec in re.findall(r'(?:const|let|var)\s+(\w+)\s*=\s*\(\s*await\s+import\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\)', s):
        r = resolve_spec(p, spec)
        if r: m[a] = r
    for named, spec in DYN_DESTR.findall(s):
        r = resolve_spec(p, spec)
        for part in named.split(','):
            part = part.strip()
            if not part: continue
            nm = part.split(':')[-1].strip()
            if r: m[nm] = r
    for names, specs in DYN_PROMISE_ALL.findall(s):
        ns = [x.strip() for x in names.split(',')]
        ss = re.findall(r'import\(\s*[\'"]([^\'"]+)[\'"]', specs)
        for n, sp in zip(ns, ss):
            r = resolve_spec(p, sp)
            if r and n: m[n] = r
    for a, b in re.findall(r'(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\.default\b', s):
        if b in m and a not in m: m[a] = m[b]
    return m

def split_args(s, start):
    """s[start] is just after '('. Return (list_of_args, end_index)."""
    depth = 0; args = []; cur = []; i = start; q = None
    while i < len(s):
        c = s[i]
        if q:
            cur.append(c)
            if c == '\\': cur.append(s[i+1]); i += 2; continue
            if c == q: q = None
        elif c in '\'"`':
            q = c; cur.append(c)
        elif c in '([{':
            depth += 1; cur.append(c)
        elif c in ')]}':
            if depth == 0:
                args.append(''.join(cur).strip()); return args, i
            depth -= 1; cur.append(c)
        elif c == ',' and depth == 0:
            args.append(''.join(cur).strip()); cur = []
        else:
            cur.append(c)
        i += 1
    return args, i

VERB = re.compile(r'\b(\w+)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*([\'"`])(/[^\'"`]*)\3')
USE = re.compile(r'\b(\w+)\s*\.\s*use\s*\(')
ENTRY = re.compile(r'\{\s*path:\s*[\'"]([^\'"]+)[\'"]\s*,\s*router:\s*([\w.]+)')

def expr_target(expr, imap, p):
    e = expr.strip()
    e = re.sub(r'\s+as\s+\w+$', '', e)
    e = re.sub(r'\s*\|\|.*$', '', e)
    m = re.match(r'^(?:new\s+)?(\w+)(?:\.(\w+))?', e)
    if not m: return None, None
    base = m.group(1)
    if base in imap: return imap[base], base
    return p, base  # locally defined router

def file_routes(p):
    s = strip_comments(read(p))
    out = []
    for m in VERB.finditer(s):
        ident, verb, _, path = m.groups()
        line = s.count('\n', 0, m.start()) + 1
        out.append((ident, verb.upper(), path, line))
    return out

def file_uses(p):
    s = strip_comments(read(p))
    out = []
    for m in USE.finditer(s):
        ident = m.group(1)
        args, _ = split_args(s, m.end())
        if not args: continue
        line = s.count('\n', 0, m.start()) + 1
        path = ''
        mm = re.match(r'^[\'"`](/[^\'"`]*)[\'"`]$', args[0])
        if mm:
            path = mm.group(1); rest = args[1:]
        elif re.match(r'^[\'"`]', args[0]):
            continue
        else:
            rest = args
        if not rest: continue
        out.append((ident, path, rest[-1], line))
    for m in ENTRY.finditer(s):
        line = s.count('\n', 0, m.start()) + 1
        out.append(('app', m.group(1), m.group(2), line))
    return out

routes = []  # (method, fullpath, file, line, via)
seen = set()

def join(a, b):
    if not b or b == '/': return a if a else '/'
    return (a.rstrip('/') + '/' + b.lstrip('/')) if a else b

def expand(p, prefix, via, depth=0):
    key = (p, prefix)
    if key in seen or depth > 6: return
    seen.add(key)
    imap = imports_of(p)
    for ident, verb, path, line in file_routes(p):
        if ident == 'app': continue
        routes.append((verb, join(prefix, path), os.path.relpath(p, ROOT), line, via))
    for ident, path, target, line in file_uses(p):
        if ident == 'app': continue
        tf, _ = expr_target(target, imap, p)
        if tf and tf != p:
            expand(tf, join(prefix, path), via + ' > ' + os.path.relpath(tf, ROOT), depth + 1)

server_files = list(walk(os.path.join(ROOT, 'server'), ('.ts', '.js', '.mjs')))
mounts = []
for p in server_files:
    imap = None
    for ident, verb, path, line in file_routes(p):
        if ident == 'app' and path.startswith('/api'):
            routes.append((verb, path, os.path.relpath(p, ROOT), line, 'direct app.' + verb.lower()))
    for ident, path, target, line in file_uses(p):
        if ident != 'app' or not path.startswith('/api'): continue
        if imap is None: imap = imports_of(p)
        tf, base = expr_target(target, imap, p)
        mounts.append((path, os.path.relpath(p, ROOT), line, target, tf and os.path.relpath(tf, ROOT)))
        if tf:
            if tf == p:
                # locally-built router: take routes on that ident in this file
                for ident2, verb, rpath, rline in file_routes(p):
                    if ident2 == base:
                        routes.append((verb, join(path, rpath), os.path.relpath(p, ROOT), rline, 'local ' + base))
                for ident2, sub, tgt, l2 in file_uses(p):
                    if ident2 == base:
                        tf2, _ = expr_target(tgt, imap, p)
                        if tf2 and tf2 != p:
                            expand(tf2, join(path, sub), 'local ' + base)
            else:
                expand(tf, path, os.path.relpath(p, ROOT) + ':' + str(line))

with open(os.path.join(OUT, 'server_mounts.tsv'), 'w') as f:
    for m in sorted(mounts):
        f.write('\t'.join(str(x) for x in m) + '\n')
with open(os.path.join(OUT, 'server_routes.tsv'), 'w') as f:
    for r in sorted(set(routes), key=lambda r: (r[1], r[0])):
        f.write('\t'.join(str(x) for x in r) + '\n')

# ---------------- client ----------------
CLIENT_BASE = os.path.join(ROOT, 'client/src/concept2cure')
def resolve_concat(s, toks, idx):
    """Follow `'a' + expr + 'b'` chains starting at toks[idx]. Returns (text, consumed_token_indices)."""
    starts = {t[2]: k for k, t in enumerate(toks)}
    text = toks[idx][1]; pos = toks[idx][3]; used = {idx}; n = len(s)
    while True:
        j = pos
        while j < n and s[j] in ' \t\r\n': j += 1
        if j >= n or s[j] != '+' or (j + 1 < n and s[j+1] in '+='): break
        j += 1
        while j < n and s[j] in ' \t\r\n': j += 1
        if j in starts:
            k = starts[j]; t = toks[k]; used.add(k)
            text += t[1].replace('${}', ':p') if t[0] == 'tpl' else t[1]
            pos = t[3]; continue
        # expression: scan to next top-level '+' or terminator
        d = 0; k = j
        while k < n:
            c = s[k]
            if k in starts: k = toks[starts[k]][3]; continue
            if c in '([{': d += 1
            elif c in ')]}':
                if d == 0: break
                d -= 1
            elif d == 0 and c in ',;?:': break
            elif d == 0 and c == '+': break
            elif d == 0 and c == '\n':
                # newline ends expression unless continuation follows
                m = k + 1
                while m < n and s[m] in ' \t': m += 1
                if m < n and s[m] == '+': k = m; break
            k += 1
        text += ':p'; pos = k
        if k < n and s[k] == '+': pos = k; continue
        break
    return text, used

client = []
for ln in open(os.path.join(OUT, 'client_calls_ast.tsv')):
    ln = ln.rstrip('\n')
    if not ln: continue
    url, meth, f, line = ln.split('\t')
    client.append((url, False, f, int(line), meth))

def segs(x):
    return [z for z in x.strip('/').split('/') if z != '']

def seg_match(c, s):
    if s.startswith(':') or s == '*' or s.startswith('*'): return True
    if ':p' in c:
        pat = '^' + re.escape(c).replace(':p', '.*') + '$'
        return re.match(pat, s) is not None or s.startswith(':')
    return c == s

def match(cpath, spath):
    cs, ss = segs(cpath), segs(spath)
    if ss and (ss[-1] in ('*',) or ss[-1].endswith('(*)')):
        if len(cs) < len(ss) - 1: return False
        return all(seg_match(a, b) for a, b in zip(cs, ss[:-1]))
    if len(cs) != len(ss): return False
    return all(seg_match(a, b) for a, b in zip(cs, ss))

def prefix_match(cpath, spath):
    cs, ss = segs(cpath), segs(spath)
    if len(ss) <= len(cs): return False
    return all(seg_match(a, b) for a, b in zip(cs, ss[:len(cs)]))

sroutes = sorted(set(routes))
res = []
for norm, concat, f, line, meth in client:
    exact = [r for r in sroutes if match(norm, r[1])]
    exact_m = [r for r in exact if not meth or r[0] in (meth, 'ALL')]
    if norm.endswith('/') or concat:
        # literal is a prefix of a longer concatenated path
        pref = [r for r in sroutes if prefix_match(norm.rstrip('/'), r[1]) or match(norm.rstrip('/'), r[1])]
        status = 'PREFIX-OK' if pref else 'NONE'
        hit = pref[:1]
    elif exact_m:
        status, hit = 'MATCH', exact_m[:1]
    elif exact:
        status, hit = 'METHOD-MISMATCH', exact[:1]
    else:
        pref = [r for r in sroutes if prefix_match(norm, r[1])]
        status = 'PREFIX-ONLY' if pref else 'NONE'
        hit = pref[:1]
    res.append((status, meth, norm, f, line, hit[0][1] + ' @' + hit[0][2] + ':' + str(hit[0][3]) if hit else ''))

with open(os.path.join(OUT, 'client_xref.tsv'), 'w') as fo:
    for r in sorted(res):
        fo.write('\t'.join(str(x) for x in r) + '\n')
from collections import Counter
print('server mounts:', len(mounts), 'server routes:', len(sroutes), 'client literals:', len(res))
print(Counter(r[0] for r in res))
