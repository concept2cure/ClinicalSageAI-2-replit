from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, time
BASE='http://127.0.0.1:5000'
OUT=Path('/workspace/scratch/c2c-handoff-runtime')
threads=json.loads((OUT/'threads.json').read_text())
A,B=threads
project=json.loads((OUT/'project.json').read_text())
program=project['id']
def thread_url(t): return BASE+'/concept2cure/conversation-thread/'+t['id']+'?program='+program
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for width,height,label,dark in [(390,844,'mobile-dark',True)]:
  context=browser.new_context(viewport={'width':width,'height':height},storage_state=str(OUT/'browser-state.json'))
  context.add_init_script('const prefs=JSON.parse(localStorage.getItem("c2c-v2-prefs")||"{}");localStorage.setItem("c2c-v2-prefs",JSON.stringify({...prefs,dark:'+json.dumps(dark)+',railCollapsed:'+json.dumps(width<=640)+',railDefault:2}));')
  page=context.new_page()
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def wait_for_thread(t):
   expect(page.locator('.ct-user-b')).to_have_text([t['content']],timeout=45000)
   page.wait_for_url(thread_url(t),timeout=15000)
   context_now=page.evaluate("({global:window.C2C_PROJECT?.id,mirror:JSON.parse(sessionStorage.getItem('c2c.shell-project')||'{}').id,url:new URL(location.href).searchParams.get('program')})")
   if any(v!=program for v in context_now.values()): raise AssertionError('Project context changed: '+str(context_now))
  def select_rail(t):
   target=page.get_by_test_id('rail-recents').get_by_role('button',name=t['content'],exact=True)
   if not target.is_visible(): page.get_by_role('button',name='Open the sidebar',exact=True).click()
   target.click()
  def select_palette(t):
   page.keyboard.press('Control+k')
   dialog=page.get_by_role('dialog',name='Command palette')
   expect(dialog).to_be_visible()
   dialog.get_by_role('button',name=t['content'],exact=True).click()
   expect(dialog).not_to_be_visible()
  page.goto(thread_url(A),wait_until='domcontentloaded',timeout=120000)
  wait_for_thread(A)
  expect(page.locator('.c2c-v2')).to_have_class(__import__('re').compile(r'\bdark\b') if dark else __import__('re').compile(r'^(?!.*\bdark\b).*$'))
  select_rail(B)
  wait_for_thread(B)
  page.screenshot(path=str(OUT/f'after-{label}-rail-B.png'))
  rail={'url':page.url,'messages':page.locator('.ct-user-b').all_text_contents()}
  composer=page.get_by_role('textbox',name='Reply to AnA',exact=True)
  draft=f'Unsent {label} question stays in B'
  composer.fill(draft)
  page.evaluate("window.__f1Composer = document.querySelector('.ct-composer textarea')")
  select_rail(B)
  expect(composer).to_have_value(draft)
  same_rail=page.evaluate("window.__f1Composer === document.querySelector('.ct-composer textarea')")
  if not same_rail: raise AssertionError('Same-thread Rail remounted the composer')
  select_palette(B)
  expect(composer).to_have_value(draft)
  same_palette=page.evaluate("window.__f1Composer === document.querySelector('.ct-composer textarea')")
  if not same_palette: raise AssertionError('Same-thread palette remounted the composer')
  page.screenshot(path=str(OUT/f'after-{label}-same-thread-draft.png'))
  composer.fill('')
  select_rail(A)
  wait_for_thread(A)
  select_rail(B)
  wait_for_thread(B)
  select_palette(A)
  wait_for_thread(A)
  select_palette(B)
  wait_for_thread(B)
  page.screenshot(path=str(OUT/f'after-{label}-palette-B.png'))
  palette={'url':page.url,'messages':page.locator('.ct-user-b').all_text_contents()}
  page.reload(wait_until='domcontentloaded')
  wait_for_thread(B)
  results.append({'viewport':f'{width}x{height}','theme':'dark' if dark else 'light','project_context_retained':program,'rail_A_to_B':rail,'palette_A_to_B':palette,'same_thread_rail_preserved_composer':same_rail,'same_thread_palette_preserved_composer':same_palette,'same_thread_unsent_text_preserved':True,'reload_retained_B':True,'page_errors':errors})
  (OUT/'final-mobile.json').write_text(json.dumps(results,indent=2))
  print(json.dumps(results[-1],indent=2),flush=True)
  context.close()
 browser.close()
