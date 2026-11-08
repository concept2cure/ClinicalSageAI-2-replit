def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
dark={'bg-000':'#262624','bg-100':'#30302e','bg-200':'#3d3d3a','border-strong':'#4a4a46','border-control':'#8a8a82'}
for fg in ('border-strong','border-control'):
    for bg in ('bg-100','bg-200'):
        print('dark',fg,'on',bg,round(cr(dark[fg],dark[bg]),2))
print('dark bg-200 on bg-100', round(cr(dark['bg-200'],dark['bg-100']),2))
light={'bg-000':'#faf9f5','bg-100':'#f0eee6','bg-200':'#e8e6dc','border':'#dad9d4','border-control':'#7f7d75'}
print('light border on bg-100', round(cr(light['border'],light['bg-100']),2))
print('light bg-000 on bg-100', round(cr(light['bg-000'],light['bg-100']),2))
print('light border-control on bg-100', round(cr(light['border-control'],light['bg-100']),2))
