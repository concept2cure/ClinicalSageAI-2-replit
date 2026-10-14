"""Reachable actual 390px table pan; no API interception, viewport/CSS/source/data changes."""
import datetime,hashlib,importlib.util,json,pathlib,time
from playwright.sync_api import sync_playwright
FOLDER=pathlib.Path('/tmp/submission-deliverables-browser-prep');REPO=pathlib.Path('/workspace/ClinicalSageAI-2-replit')
spec=importlib.util.spec_from_file_location('review',FOLDER/'review_live.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
config=json.loads((FOLDER/'fixture-identities.json').read_text());pins=json.loads((FOLDER/'final-production-source-pins.json').read_text())
assert all(hashlib.sha256((REPO/name).read_bytes()).hexdigest()==digest for name,digest in pins['files'].items())
out=FOLDER/('mobile-pan-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()));out.mkdir(mode=0o700)
proof={'qualification':'Actual reachable table scrolling in the unchanged390px viewport; no source, CSS, response, data or viewport modification. Tokens stay in memory.','productionPins':pins,'cases':[],'pageErrors':[],'consoleErrors':[],'apiFailures':[],'nonReadRequests':[],'manifests':[]}
GEOMETRY="""(matrix)=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};const r=matrix.getBoundingClientRect();let left=r.left+matrix.clientLeft,right=left+matrix.clientWidth;const clips=[];let ancestor=matrix.parentElement;while(ancestor){const style=getComputedStyle(ancestor);if(['auto','scroll','hidden','clip'].includes(style.overflowX)){const a=ancestor.getBoundingClientRect();const l=a.left+ancestor.clientLeft,rt=l+ancestor.clientWidth;left=Math.max(left,l);right=Math.min(right,rt);clips.push({tag:ancestor.tagName,className:ancestor.className,left:l,right:rt,overflowX:style.overflowX})}ancestor=ancestor.parentElement}const source=matrix.querySelector('td:last-child > .sc-mb');const chips=[...source.querySelectorAll('.sc-chiprow .rd-chip')].map(e=>({...box(e),text:e.innerText}));return {scrollLeft:matrix.scrollLeft,scrollWidth:matrix.scrollWidth,clientWidth:matrix.clientWidth,matrix:box(matrix),visible:{left,right,width:right-left},clips,source:box(source),chips,allBadgeBoxesVisible:chips.every(e=>e.left>=left-0.5&&e.right<=right+0.5)}}"""
with sync_playwright() as driver:
 browser=driver.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 auth=browser.new_context();login=auth.request.post(config['baseUrl']+'/api/auth/dev-login',data={'email':config['ownerEmail']});assert login.status==200
 session=login.json();assert str(session['user']['id'])=='15' and str(session['user']['organizationId'])=='15';auth.close()
 expiry=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=session.get('expiresIn',3600))).isoformat()
 storage={'trialsage_access_token':session['accessToken'],'trialsage_refresh_token':session.get('refreshToken',''),'trialsage_token_expiry':expiry,'trialsage_user':json.dumps(session['user'])}
 for variant in [v for v in config['variants'] if v['width']==390]:
  context=browser.new_context(viewport={'width':390,'height':variant['height']},device_scale_factor=1,color_scheme='dark' if variant['dark'] else 'light')
  prefs={'dark':variant['dark'],'railCollapsed':True,'anaMode':'standard','anaRunPolicy':'manual','segment':'medtech','welcomeDismissed':True,'liveDrive':False,'liveDriveDefault':2}
  context.add_init_script('((a,p)=>{for(const[k,v]of Object.entries(a)){localStorage.setItem(k,v);sessionStorage.setItem(k,v)}localStorage.setItem("c2c-v2-prefs",JSON.stringify(p))})('+json.dumps(storage)+','+json.dumps(prefs)+')')
  page=context.new_page();page.on('pageerror',lambda error:proof['pageErrors'].append(review.safe_error(error)))
  page.on('console',lambda msg:proof['consoleErrors'].append(review.safe_error(msg.text)) if msg.type=='error' else None)
  def observe(response):
   if '/api/' not in response.url:return
   if response.status>=400:proof['apiFailures'].append({'path':review.urlparse(response.url).path,'status':response.status})
   if review.urlparse(response.url).path.endswith('/pathway-manifest'):proof['manifests'].append({'status':response.status,'body':review.retained_manifest(response.json())})
  page.on('response',observe)
  page.on('request',lambda req:proof['nonReadRequests'].append({'method':req.method,'path':review.urlparse(req.url).path}) if '/api/' in req.url and req.method not in ['GET','HEAD','OPTIONS'] else None)
  case=review.visual_case(context,page,config,config['fixtures'][0],variant,out,proof)
  card=page.locator('.pj-card').filter(has_text='Required deliverables · sequence');rows=card.locator('table.ub-inv tbody tr');matrix=card.locator('.cm-matrix').first
  rowIndex=next(index for index in range(rows.count()) if rows.nth(index).locator('td').nth(3).locator(':scope > .sc-mb').count())
  rows.nth(rowIndex).scroll_into_view_if_needed();matrix.evaluate('(e)=>{e.scrollLeft=e.scrollWidth}')
  before=matrix.evaluate(GEOMETRY);page.screenshot(path=str(out/(variant['name']+'-max-right.png')),full_page=False)
  lower=max(0,before['visible']['left']-min(chip['left'] for chip in before['chips'])+2)
  upper=before['visible']['right']-max(chip['right'] for chip in before['chips'])-2
  candidate=max(0,before['scrollLeft']-lower);matrix.evaluate('(e,value)=>{e.scrollLeft=value}',candidate)
  after=matrix.evaluate(GEOMETRY);page.screenshot(path=str(out/(variant['name']+'-reachable-pan.png')),full_page=False)
  result={'variant':variant['name'],'rowIndex':rowIndex,'scope':case['scope'],'before':before,'after':after,'candidateScrollLeft':candidate,'minimumLeftPan':lower,'availableRightRoom':upper,'allThreeBadgesFullyReachable':after['allBadgeBoxesVisible'],'bodyWidth':page.evaluate('document.body.scrollWidth'),'viewportWidth':390}
  assert result['bodyWidth']==390
  proof['cases'].append(result);context.close()
 browser.close()
assert all(hashlib.sha256((REPO/name).read_bytes()).hexdigest()==digest for name,digest in pins['files'].items())
proof['sourceStableBeforeAfter']=True;proof['passed']=all(case['allThreeBadgesFullyReachable'] for case in proof['cases']) and not proof['apiFailures'] and not proof['consoleErrors'] and not proof['pageErrors']
(out/'summary.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'output':str(out),'passed':proof['passed'],'cases':[{'variant':case['variant'],'maximumScroll':case['before']['scrollLeft'],'usefulScroll':case['after']['scrollLeft'],'leftPan':case['before']['scrollLeft']-case['after']['scrollLeft'],'allThreeBadgesFullyReachable':case['allThreeBadgesFullyReachable']} for case in proof['cases']],'apiFailures':len(proof['apiFailures']),'consoleErrors':len(proof['consoleErrors']),'pageErrors':len(proof['pageErrors'])}))
raise SystemExit(0 if proof['passed'] else 1)
