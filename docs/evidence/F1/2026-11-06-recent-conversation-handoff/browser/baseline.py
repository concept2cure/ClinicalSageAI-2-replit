from playwright.sync_api import sync_playwright
from pathlib import Path
import json, datetime, os
BASE='http://127.0.0.1:5000'
OUT=Path('/workspace/scratch/c2c-handoff-runtime')
threads=json.loads((OUT/'threads.json').read_text())
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 response=context.request.post(BASE+'/api/auth/dev-login',data={'email':'ana.author@concept2cure.pro'},headers={'Origin':BASE})
 auth=response.json()
 if response.status!=200 or not auth.get('accessToken'): raise RuntimeError(f'Dev login failed: {response.status} '+str(auth.get('error',{})))
 expiry=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=20)).isoformat()
 values={'trialsage_access_token':auth['accessToken'],'trialsage_refresh_token':auth['refreshToken'],'trialsage_token_expiry':expiry,'trialsage_user':json.dumps(auth['user'])}
 context.add_init_script('const values='+json.dumps(values)+';for(const [k,v] of Object.entries(values)){localStorage.setItem(k,v);sessionStorage.setItem(k,v)}')
 page=context.new_page()
 page.goto(BASE+'/concept2cure/conversation-thread/'+threads[0]['id'],wait_until='domcontentloaded',timeout=120000)
 page.locator('.ct-user-b').filter(has_text=threads[0]['content']).wait_for(timeout=120000)
 page.get_by_test_id('rail-recents').get_by_role('button',name=threads[1]['content'],exact=True).wait_for(timeout=30000)
 page.screenshot(path=str(OUT/'before-A.png'))
 before={'url':page.url,'messages':page.locator('.ct-user-b').all_text_contents()}
 page.get_by_test_id('rail-recents').get_by_role('button',name=threads[1]['content'],exact=True).click()
 page.wait_for_timeout(1600)
 after={'url':page.url,'messages':page.locator('.ct-user-b').all_text_contents(),'handoff':page.evaluate('window.C2C_CONVO || null')}
 page.screenshot(path=str(OUT/'before-selected-B-still-A.png'))
 result={'before':before,'after_selecting_B':after,'bug_reproduced':threads[0]['content'] in after['messages'] and threads[1]['content'] not in after['messages']}
 (OUT/'baseline.json').write_text(json.dumps(result,indent=2))
 context.storage_state(path=str(OUT/'browser-state.json'))
 os.chmod(OUT/'browser-state.json',0o600)
 print(json.dumps(result,indent=2))
 browser.close()
