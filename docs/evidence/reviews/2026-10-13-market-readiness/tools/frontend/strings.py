import re,sys,random,os
files=sys.argv[1:]
out=[]
pat=[re.compile(r'''(?:title|hint|label|placeholder|aria-label|retryLabel|msg)=["']([^"'{}]{12,200})["']'''),
     re.compile(r'''(?:title|hint|label|placeholder|summary|reason|message|setErr|toast|show|setNote|onError)\s*[:(]\s*['"`]([A-Z][^'"`]{15,220})['"`]'''),
     re.compile(r'''>\s*([A-Z][A-Za-z ,.'’—–()/&:;-]{15,200}[.a-z)])\s*<''')]
for f in files:
    src=open(f,encoding='utf-8').read()
    for i,l in enumerate(src.split('\n'),1):
        s=l.strip()
        if s.startswith(('//','*','/*')): continue
        for p in pat:
            for m in p.finditer(l):
                out.append((os.path.basename(f),i,m.group(1).strip()))
seen=set();uniq=[]
for o in out:
    if o[2] in seen: continue
    seen.add(o[2]);uniq.append(o)
print(len(uniq))
random.seed(7)
for f,i,t in random.sample(uniq,min(70,len(uniq))): print(f"{f}:{i}: {t}")
