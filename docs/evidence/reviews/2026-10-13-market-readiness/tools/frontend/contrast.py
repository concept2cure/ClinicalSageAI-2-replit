def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
L={'bg-000':'#faf9f5','bg-100':'#f0eee6','bg-200':'#e8e6dc','text-100':'#141413','text-200':'#3d3d3a','text-300':'#6b6963','text-400':'#75736d','text-500':'#b0aea5','accent-100':'#d97757','accent-200':'#ad5132','ai':'#366a9e','success':'#5e6d49','warning':'#955d22','error':'#b63939','border-control':'#7f7d75','border':'#dad9d4','success-muted':'#e4ebd8','warning-muted':'#f8e9d0','error-muted':'#f5dfdd','accent-muted':'#f5ddd4','white':'#ffffff'}
D={'bg-000':'#262624','bg-100':'#30302e','bg-200':'#3d3d3a','text-100':'#faf9f5','text-300':'#b0aea5','text-400':'#8e8c84','text-500':'#6b6963','accent-200':'#e8916f','accent-100':'#d97757'}
pairs=[('text-300','bg-000'),('text-300','bg-100'),('text-300','bg-200'),('text-400','bg-000'),('text-400','bg-100'),('text-400','bg-200'),('text-500','bg-000'),('text-500','bg-100'),('accent-100','bg-000'),('accent-200','bg-000'),('white','accent-100'),('white','accent-200'),('success','success-muted'),('warning','warning-muted'),('error','error-muted'),('accent-200','accent-muted'),('border-control','bg-000'),('border','bg-000'),('ai','bg-100')]
print('LIGHT')
for a,b in pairs: print(f'  {a} on {b}: {cr(L[a],L[b]):.2f}')
print('DARK')
for a,b in [('text-300','bg-000'),('text-400','bg-000'),('text-400','bg-100'),('text-400','bg-200'),('text-500','bg-000'),('text-500','bg-100'),('accent-100','bg-000'),('accent-200','bg-000')]: print(f'  {a} on {b}: {cr(D[a],D[b]):.2f}')
