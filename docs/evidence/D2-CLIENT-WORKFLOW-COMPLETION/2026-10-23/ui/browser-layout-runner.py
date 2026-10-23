import hashlib,json,pathlib,subprocess,time,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path('/workspace/ClinicalSageAI-2-replit');phase=sys.argv[1] if len(sys.argv)>1 else 'final';folder=root/'docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23/ui'/('layout-'+phase);folder.mkdir(parents=True,exist_ok=True)
sheets=sorted((root/'dist/public/assets').glob('*.css'),key=lambda p:(0 if p.name.startswith('index-') else 1 if p.name.startswith('V2App-') else 2,p.name));assert sheets
styles='\n'.join('<style>'+p.read_text()+'</style>' for p in sheets);results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for stem in ['picker','selected','receipt']:
  fragment=pathlib.Path('/workspace/scratch/estar-visual',stem+'.html').read_text()
  for theme in ['light','dark']:
   for width,height in [(1440,900),(390,844)]:
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,color_scheme=theme)
    page.route('**/*',lambda route:route.abort())
    themeAttrs=' class="dark" data-theme="dark"' if theme=='dark' else ''
    wrapperClass='c2c-v2 dark' if theme=='dark' else 'c2c-v2'
    page.set_content('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body'+themeAttrs+'><div class="'+wrapperClass+'" data-theme="'+theme+'" style="display:block;height:auto;min-height:100vh;overflow:visible"><div class="mdx-shell" data-surface="true"><div class="page"><div class="page-inner">'+fragment+'</div></div></div></div></body></html>')
    page.wait_for_timeout(150)
    result=page.evaluate('''() => {
     const box=x=>{const r=x.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
     const panel=document.querySelector('[data-testid="official-estar-attachments"]');
     const over=[...document.querySelectorAll('fieldset,.vpick,.vpick-hit,.section-sub,[data-testid="official-estar-attachment-receipts"]')].filter(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+1).map(x=>({tag:x.tagName,className:x.className,text:x.textContent.slice(0,120),clientWidth:x.clientWidth,scrollWidth:x.scrollWidth}));
     const controls=[...panel.querySelectorAll('button,input,select')].map(x=>({tag:x.tagName,text:x.textContent.trim().slice(0,70),box:box(x),disabled:x.disabled}));
     const actions=[...document.querySelectorAll('button')].filter(x=>/Generate official|Add Vault|Change document|Remove attachment|Select document/.test(x.textContent)).map(x=>{x.scrollIntoView({block:'center'});const r=x.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return {text:x.textContent.trim(),box:box(x),visibleAtCenter:hit===x||x.contains(hit)}});
     document.querySelectorAll('.vpick-results').forEach(x=>{x.scrollTop=0;x.scrollLeft=0});window.scrollTo(0,0);
     return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,panel:{box:box(panel),clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth},over,controls,actions,styles:{background:getComputedStyle(panel).backgroundColor,textColor:getComputedStyle(panel).color,fontFamily:getComputedStyle(panel).fontFamily},text:document.body.innerText};
    }''')
    filename=f'{stem}-{theme}-{width}.png';page.screenshot(path=str(folder/filename),full_page=True)
    failures=[]
    if result['documentWidth']>width:failures.append('page horizontal overflow')
    if result['panel']['scrollWidth']>result['panel']['clientWidth']+1:failures.append('attachment panel horizontal overflow')
    if result['over']:failures.append('text/container horizontal overflow')
    if any(x['box']['height']<43.9 or x['box']['width']<43.9 for x in result['controls']):failures.append('attachment control below 44px touch target')
    if not all(x['visibleAtCenter'] for x in result['actions']):failures.append('an action is unreachable')
    if any(x['box']['height']<43.9 for x in result['actions'] if 'Generate official' in x['text']):failures.append('Generate action below 44px touch target')
    result.update({'component':stem,'theme':theme,'screenshot':filename,'failures':failures});results.append(result);page.close()
 browser.close()
report={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'scope':'Serialized actual mounted official eSTAR component/picker DOM, existing MDX surface host inside V2 scope, all built CSS in index,V2App,other order. Local Chromium layout only; full app events, live backend, actual PDF viewing, external fonts and human acceptance not exercised. External requests blocked.','sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'captures':{s:hashlib.sha256(pathlib.Path('/workspace/scratch/estar-visual',s+'.html').read_bytes()).hexdigest() for s in ['picker','selected','receipt']},'cssFiles':[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sheets],'results':results}
(folder/'component-browser-review.json').write_text(json.dumps(report,indent=2)+'\n')
for r in results:print(json.dumps({'component':r['component'],'theme':r['theme'],'width':r['viewport']['width'],'documentWidth':r['documentWidth'],'failures':r['failures'],'smallControls':[x for x in r['controls'] if x['box']['height']<43]}))
raise SystemExit(1 if any(r['failures'] for r in results) else 0)
