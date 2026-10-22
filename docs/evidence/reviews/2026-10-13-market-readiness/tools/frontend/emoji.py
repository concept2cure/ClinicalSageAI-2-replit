import os,re,sys
root=sys.argv[1]
emo=re.compile('[\U0001F300-\U0001FAFF☀-⛿✀-➿⭐⬆⬇⤴⤵〰〽]')
excl=re.compile(r"""(['"`>])([^'"`<>{}\n]*[A-Za-z][^'"`<>{}\n]*!)(['"`<\s])""")
hits_e=[];hits_x=[]
for dp,dn,fn in os.walk(root):
    if '__tests__' in dp or 'node_modules' in dp: continue
    for f in fn:
        if not f.endswith(('.tsx','.ts','.jsx')) or '.test.' in f or '.stories.' in f: continue
        p=os.path.join(dp,f)
        for i,l in enumerate(open(p,encoding='utf-8',errors='ignore'),1):
            s=l.strip()
            if s.startswith(('//','*','/*')): continue
            for m in emo.finditer(l):
                hits_e.append(f"{p}:{i}: {m.group(0)!r} {s[:110]}")
            for m in excl.finditer(l):
                t=m.group(2)
                if '!=' in t or '!(' in t or t.strip().startswith('!') : continue
                if re.search(r'[A-Za-z]!\s*$',t) or re.search(r'[a-z]\!$',t):
                    hits_x.append(f"{p}:{i}: {s[:140]}")
print("EMOJI",len(hits_e))
for h in hits_e[:60]: print(h)
print("EXCL",len(hits_x))
for h in hits_x[:60]: print(h)
