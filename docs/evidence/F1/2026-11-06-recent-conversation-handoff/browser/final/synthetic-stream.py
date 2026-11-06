from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json,time
OUT=Path('/workspace/scratch/c2c-handoff-runtime'); BASE='http://127.0.0.1:5000'
A,B=json.loads((OUT/'threads.json').read_text()); program=json.loads((OUT/'project.json').read_text())['id']
def address(t): return BASE+'/concept2cure/conversation-thread/'+t['id']+'?program='+program
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for width,height,dark,label in [(1440,1000,False,'desktop-light'),(390,844,True,'mobile-dark')]:
  context=browser.new_context(viewport={'width':width,'height':height},storage_state=str(OUT/'browser-state.json'))
  context.add_init_script('const prefs=JSON.parse(localStorage.getItem("c2c-v2-prefs")||"{}");localStorage.setItem("c2c-v2-prefs",JSON.stringify({...prefs,dark:'+json.dumps(dark)+',railCollapsed:'+json.dumps(width<=640)+',railDefault:2}));')
  page=context.new_page(); pending=[]; requested_B=[]; errors=[]
  page.route('**/api/ana-ri/stream',lambda route:pending.append(route))
  page.on('request',lambda request:requested_B.append(request.url) if B['id'] in request.url else None)
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(address(A),wait_until='domcontentloaded',timeout=120000)
  expect(page.locator('.ct-user-b')).to_have_text([A['content']],timeout=45000)
  page.wait_for_url(address(A),timeout=15000)
  composer=page.locator('.ct-composer textarea')
  composer.fill('Synthetic pending-answer guard check; no provider request is sent.')
  page.get_by_role('button',name='Send message to AnA',exact=True).click()
  for _ in range(100):
   if pending: break
   page.wait_for_timeout(100)
  if len(pending)!=1: raise AssertionError('Expected exactly one intercepted synthetic request')
  followup='Unsent follow-up survives refused B selection'
  composer.fill(followup)
  expect(page.get_by_role('button',name='Send message to AnA',exact=True)).to_be_disabled()
  page.evaluate("window.__streamComposer=document.querySelector('.ct-composer textarea')")
  full_url=page.url
  def check_preserved():
   expect(composer).to_have_value(followup)
   if not page.evaluate("window.__streamComposer===document.querySelector('.ct-composer textarea')"): raise AssertionError('Refusal remounted composer')
   if page.url!=full_url: raise AssertionError('Refusal changed full URL: '+page.url)
   if requested_B: raise AssertionError('Refusal requested B history')
   if page.evaluate('window.C2C_CONVO?.id')!='current': raise AssertionError('Refused B selection not consumed')
  def rail(t):
   button=page.get_by_test_id('rail-recents').get_by_role('button',name=t['content'],exact=True)
   if not button.is_visible(): page.get_by_role('button',name='Open the sidebar',exact=True).click()
   button.click()
  rail(B)
  expect(page.get_by_role('alert').filter(has_text='AnA is still answering in the current conversation')).to_be_visible()
  check_preserved()
  page.keyboard.press('Control+k')
  palette=page.get_by_role('dialog',name='Command palette')
  palette.get_by_role('button',name=B['content'],exact=True).click()
  expect(palette).not_to_be_visible()
  check_preserved()
  page.screenshot(path=str(OUT/f'synthetic-{label}-refusal.png'))
  body='data: '+json.dumps({'type':'text','content':'Synthetic browser fixture: still answering A.'})+'\n\n'+'data: '+json.dumps({'type':'post_done','cleanedResponse':'Synthetic browser fixture: finished A.'})+'\n\n'
  pending[0].fulfill(status=200,content_type='text/event-stream',body=body)
  expect(page.get_by_text('Synthetic browser fixture: finished A.',exact=True)).to_be_visible(timeout=15000)
  expect(page.get_by_role('button',name='Send message to AnA',exact=True)).to_be_enabled()
  check_preserved()
  composer.fill('')
  rail(B)
  expect(page.locator('.ct-user-b')).to_have_text([B['content']],timeout=45000)
  page.wait_for_url(address(B),timeout=15000)
  expect(page.get_by_role('alert').filter(has_text='AnA is still answering in the current conversation')).to_have_count(0)
  result={'viewport':f'{width}x{height}','theme':'dark' if dark else 'light','stream_source':'Playwright intercepted POST /api/ana-ri/stream and held the full response; both text/post_done frames were synthetic; no provider called','intercepted_stream_requests':len(pending),'rail_and_palette_refused_B_while_pending':True,'full_A_url_preserved':full_url,'same_composer_node_and_unsent_followup_preserved':True,'refused_handoff_consumed':True,'no_B_history_request_before_fresh_selection':True,'completion_did_not_replay_B':True,'fresh_B_selection_loaded_history':True,'accepted_retry_cleared_refusal_notice':True,'page_errors':errors}
  results.append(result)
  (OUT/'synthetic-stream.json').write_text(json.dumps(results,indent=2))
  print(json.dumps(result,indent=2),flush=True)
  context.close()
 browser.close()
