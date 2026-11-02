import re, sys, os, collections
root = sys.argv[1]
tag_re = re.compile(r'<(/?)([A-Za-z][\w.]*)((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)(/?)>', re.S)
out = collections.Counter(); sites = []
for dp, dn, fn in os.walk(root):
    if '__tests__' in dp: continue
    for f in fn:
        if not f.endswith('.tsx'): continue
        p = os.path.join(dp, f); src = open(p, encoding='utf8').read()
        if 'reg-tbl' not in src: continue
        stack = []
        for m in tag_re.finditer(src):
            close, name, attrs, selfc = m.group(1), m.group(2), m.group(3), m.group(4)
            if close:
                # pop to matching name
                for i in range(len(stack)-1, -1, -1):
                    if stack[i][0] == name:
                        del stack[i:]; break
                continue
            cls = re.search(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\'([^\']*)\')', attrs)
            c = (cls.group(1) or cls.group(2) or cls.group(3)) if cls else ''
            if name == 'table' and re.search(r'(^|\s)reg-tbl(\s|$)', c):
                parent = stack[-1] if stack else ('?', '')
                pc = set(parent[1].split())
                if pc & {'pj-card', 'pj-card-b', 'reg-card'}:
                    line = src.count('\n', 0, m.start()) + 1
                    out[os.path.relpath(p, root)] += 1; sites.append(f'{os.path.relpath(p, root)}:{line} parent <{parent[0]} className="{parent[1]}">')
            if not selfc:
                stack.append((name, c))
for k, v in sorted(out.items()): print(f'{k}: {v}')
print('total tables', sum(out.values()), 'files', len(out))
for s in sites: print(' ', s)
