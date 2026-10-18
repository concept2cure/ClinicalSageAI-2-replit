import os,re,sys,collections
root=sys.argv[1]
launch=set(sys.argv[2].split(',')) if len(sys.argv)>2 else None
tag_re=re.compile(r'<(div|span|li|tr|td|section|article|p|img|label|h[1-6]|ul|g|svg|circle|rect|path|header|footer|aside|main|nav|figure)\b((?:[^<>]|=>|\{[^{}]*\})*?)/?>',re.S)
res=collections.Counter(); samples=collections.defaultdict(list); scrims=0
for dp,dn,fn in os.walk(root):
    if '__tests__' in dp: continue
    for f in fn:
        if not f.endswith('.tsx') or '.test.' in f: continue
        p=os.path.join(dp,f)
        src=open(p,encoding='utf-8',errors='ignore').read()
        for m in tag_re.finditer(src):
            attrs=m.group(2)
            if 'onClick' not in attrs: continue
            hasRole='role=' in attrs; hasTab='tabIndex' in attrs; hasKey=re.search(r'onKey(Down|Up|Press)',attrs) is not None
            hidden='aria-hidden' in attrs
            line=src[:m.start()].count('\n')+1
            if hidden or re.search(r'scrim|backdrop|-bd\b|overlay',attrs):
                scrims+=1; continue
            if 'stopPropagation' in attrs and not hasRole:
                res['stopPropagation-only']+=1; continue
            if not (hasRole and hasTab and hasKey):
                res[os.path.relpath(p,root)]+=1
                samples[os.path.relpath(p,root)].append(line)
tot=sum(v for k,v in res.items() if k!='stopPropagation-only')
print('non-interactive onClick lacking role+tabIndex+key handler:',tot,'(scrims/aria-hidden skipped:',scrims,', stopPropagation containers:',res['stopPropagation-only'],')')
for k,v in res.most_common(25):
    if k=='stopPropagation-only':continue
    print(v,k,samples[k][:6])
