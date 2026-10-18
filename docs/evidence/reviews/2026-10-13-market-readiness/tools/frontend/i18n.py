import json,os
base='<repo>/client/public/locales'
def flat(d,p=''):
    o={}
    for k,v in d.items():
        kk=p+'.'+k if p else k
        if isinstance(v,dict): o.update(flat(v,kk))
        else: o[kk]=v
    return o
en={ns:flat(json.load(open(f'{base}/en/{ns}.json'))) for ns in ['auth','common','home','settings']}
print('en keys',{k:len(v) for k,v in en.items()})
for lng in sorted(os.listdir(base)):
    if lng=='en':continue
    tot=0;have=0;same=0
    for ns,keys in en.items():
        p=f'{base}/{lng}/{ns}.json'
        d=flat(json.load(open(p))) if os.path.exists(p) else {}
        for k,v in keys.items():
            tot+=1
            if k in d and d[k]: 
                have+=1
                if d[k]==v and isinstance(v,str) and len(v)>3: same+=1
    print(lng, f'{have}/{tot}={100*have/tot:.0f}%', 'identical-to-en', same)
