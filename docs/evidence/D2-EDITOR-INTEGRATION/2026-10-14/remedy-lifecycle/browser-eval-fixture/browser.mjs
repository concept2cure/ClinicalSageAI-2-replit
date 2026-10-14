import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createApiState,interceptApi} from './mock-api.mjs';
import {accessibility,measure} from './visual-checks.mjs';

const BUNDLE=fileURLToPath(new URL('.',import.meta.url));
const ROOT=resolve(fileURLToPath(new URL('../../../../../../',import.meta.url)));
const OUT=resolve(BUNDLE,'..');
const URL_PATH='/'+relative(ROOT,BUNDLE).split(sep).join('/')+'/';
const raw=readFileSync(new URL('./api-contract.json',import.meta.url),'utf8');
const snapshot=JSON.parse(raw);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
function assert(ok,reason){if(!ok)throw new Error(reason);}
const applyButton=page=>page.getByRole('button',{name:'Apply as tracked suggestion',exact:true});
const addedButton=page=>page.getByRole('button',{name:'Added as tracked suggestion',exact:true});
const editor=page=>page.locator('.ProseMirror');
async function startPage(width,theme,mode){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390,isMobile:width===390,colorScheme:theme});
  const page=await context.newPage();const state=createApiState(snapshot,mode);
  await page.clock.install({time:new Date('2026-10-14T12:00:00.000Z')});
  page.on('console',m=>{if(m.type()==='error')state.consoleErrors.push(m.text());});
  page.on('pageerror',e=>state.pageErrors.push(e.message));
  await page.route('**/api/**',route=>interceptApi(route,state));
  await page.addInitScript(()=>{localStorage.setItem('trialsage_access_token','synthetic-browser-token');localStorage.setItem('trialsage_user',JSON.stringify({id:1,email:'synthetic@example.invalid',displayName:'Synthetic evaluator',organizationId:1,roles:['regulatory-author']}));});
  await page.goto(`http://127.0.0.1:5176${URL_PATH}?theme=${theme}&mode=${mode}`);
  await editor(page).waitFor();
  await page.waitForFunction(()=>window.remedyBridge?.sectionId);
  return {context,page,state};
}
async function capture(page,label,stage){
  const editable=await editor(page).getAttribute('contenteditable')==='true';
  await page.locator('[data-testid="dc-expanded"]').scrollIntoViewIfNeeded();
  if(editable)await editor(page).scrollIntoViewIfNeeded();
  const readPassage=stage.endsWith('-passage');
  if(readPassage)await editor(page).locator('p').first().scrollIntoViewIfNeeded();
  const metrics=await measure(page);const axe=await accessibility(page);
  let passage=null;
  if(readPassage){
    passage=await editor(page).locator('p').first().evaluate(p=>{
      const r=p.getBoundingClientRect();let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(window.innerWidth,r.right),bottom=Math.min(window.innerHeight,r.bottom);
      for(let ancestor=p.parentElement;ancestor;ancestor=ancestor.parentElement){const style=window.getComputedStyle(ancestor);if(/(auto|scroll|hidden|clip)/.test(style.overflowX+style.overflowY)){const a=ancestor.getBoundingClientRect();left=Math.max(left,a.left);top=Math.max(top,a.top);right=Math.min(right,a.right);bottom=Math.min(bottom,a.bottom);}}
      return {text:p.innerText,width:r.width,height:r.height,visibleWidth:Math.max(0,right-left),visibleHeight:Math.max(0,bottom-top),insertions:[...p.querySelectorAll('ins')].map(n=>n.innerText),deletions:[...p.querySelectorAll('del')].map(n=>n.innerText)};
    });
    assert(passage.visibleWidth>=passage.width-1&&passage.visibleHeight>=passage.height-1,'Correction paragraph is clipped');
    assert(passage.text.startsWith('The synthetic product is stable for '),'Correction paragraph start is not captured');
    assert(passage.insertions.join('')===snapshot.remedy.replacement&&passage.deletions.join('')===snapshot.remedy.quote,'Visible correction marks differ from the remedy');
  }
  writeFileSync(OUT+`/browser-${label}-${stage}-metrics.json`,JSON.stringify({metrics,axe,...(passage?{passage}:{})},null,2)+'\n');
  await page.screenshot({path:OUT+`/browser-${label}-${stage}.png`,fullPage:true});
  if(editable)assert(metrics.visibleEditableViewport.width>=250&&metrics.visibleEditableViewport.height>=100,'Visible editing viewport inaccessible');
  assert(await editor(page).count()===1,'More than one native editor');
  assert(metrics.page.scrollWidth<=metrics.viewport.width,'Horizontal page overflow');
  await page.screenshot({path:OUT+`/browser-${label}-${stage}.png`,fullPage:true});
  return {stage,metrics,axe,...(passage?{passage}:{}),status:await page.locator('.authoring-remedy-note').innerText(),states:await page.evaluate(()=>window.remedyStates())};
}
async function apply(page){
  await applyButton(page).waitFor();assert(await applyButton(page).isEnabled(),'Remedy action unexpectedly disabled');
  await applyButton(page).click();await addedButton(page).waitFor();
  await page.waitForFunction(()=>window.remedyAttempts.at(-1)?.result?.ok===true);
  const attempt=await page.evaluate(()=>window.remedyAttempts.at(-1));
  assert(attempt.result.receipt.docId===snapshot.document.id&&attempt.result.receipt.sectionId===snapshot.remedy.sectionId,'Receipt scope mismatch');
  assert(await editor(page).locator('[data-application-id]').count()===2,'Replacement did not retain both application marks');
  return attempt;
}
async function openReview(page){
  const region=page.getByRole('region',{name:'Suggested edits',exact:true});
  if(!await region.isVisible())await page.getByRole('button',{name:/^\d+ suggested edits?$/}).click();
  await region.waitFor();return region;
}
async function waitReceiptState(page,state){
  await page.waitForFunction(expected=>window.remedyStates().at(-1)===expected,state);
}
async function fullRejectionAndAcceptance(env,label){
  const {page,state}=env;const stages=[];const first=await apply(page);
  await waitReceiptState(page,'pending');assert(await addedButton(page).isDisabled(),'Duplicate remains enabled');
  const count=await page.evaluate(()=>window.remedyAttempts.length);await addedButton(page).click({force:true});
  assert(await page.evaluate(()=>window.remedyAttempts.length)===count,'Disabled duplicate was applied');
  let region=await openReview(page);await region.getByRole('button',{name:'Reject',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror [data-application-id]').length===1);
  await waitReceiptState(page,'pending');assert(await addedButton(page).isDisabled(),'Partial rejection enabled retry');
  stages.push(await capture(page,label,'partial-rejection'));
  region=await openReview(page);await region.getByRole('button',{name:'Reject all',exact:true}).click();
  await waitReceiptState(page,'absent');assert(await applyButton(page).isEnabled(),'Full rejection did not enable retry');
  assert((await editor(page).innerText()).includes('18 months'),'Rejection did not restore original passage');
  stages.push(await capture(page,label,'full-rejection'));
  const second=await apply(page);assert(first.result.applicationId!==second.result.applicationId,'Retry reused application UUID');
  region=await openReview(page);await region.getByRole('button',{name:'Accept all',exact:true}).click();
  await waitReceiptState(page,'settled');assert(await addedButton(page).isDisabled(),'Acceptance enabled retry');
  assert((await editor(page).innerText()).includes('24 months')&&!(await editor(page).innerText()).includes('18 months'),'Accepted replacement differs');
  await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror [data-application-id]').length===0);
  stages.push(await capture(page,label,'accepted'));
  assert(state.decisions.length===3,'Expected partial reject, full reject and bulk accept audit requests');
  const firstIds=state.decisions.slice(0,2).map(d=>d.body.changeId);const secondIds=state.decisions[2].body.changeIds;
  assert(new Set([...firstIds,...secondIds]).size===4,'Audit change IDs collided across attempts');
  const times=state.decisions.flatMap(d=>d.body.changes??[d.body]).map(d=>d.at.slice(0,16));assert(new Set(times).size===1,'Audit attempts were not in the same minute');
  return {stages,first,second,decisions:state.decisions};
}
async function leaveView(page){
  await page.getByRole('button',{name:'Document',exact:true}).click();
  await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
  await page.waitForFunction(()=>window.remedyBridge?.viewMode==='document');
  await page.getByRole('button',{name:'Section',exact:true}).click();
  await editor(page).waitFor();await page.getByRole('button',{name:'Restore the device draft',exact:true}).waitFor();
  await waitReceiptState(page,'unavailable');assert(await addedButton(page).isDisabled(),'Restore/Discard choice prematurely enabled retry');
}
async function restoreAndDiscard(env,label){
  const {page}=env;const stages=[];const first=await apply(page);await waitReceiptState(page,'pending');
  await leaveView(page);stages.push(await capture(page,label,'restore-choice'));
  await page.getByRole('button',{name:'Restore the device draft',exact:true}).click();
  await waitReceiptState(page,'pending');assert(await addedButton(page).isDisabled(),'Restored pending marks enabled retry');
  assert(await editor(page).locator(`[data-application-id="${first.result.applicationId}"]`).count()===2,'Restore lost application identity');
  stages.push(await capture(page,label,'restored-pending'));
  await leaveView(page);await page.getByRole('button',{name:'Discard it',exact:true}).click();
  await waitReceiptState(page,'absent');assert(await applyButton(page).isEnabled(),'Explicit discard did not allow retry');
  assert((await editor(page).innerText()).includes('18 months'),'Discard did not return saved baseline');
  stages.push(await capture(page,label,'discarded'));
  const second=await apply(page);assert(second.result.applicationId!==first.result.applicationId,'Discard retry reused UUID');
  await waitReceiptState(page,'pending');stages.push(await capture(page,label,'discard-reapplied'));
  return {stages,first,second};
}
async function scopeSafeguards(width,theme,label){
  const checks=[];
  for(const mode of ['stale','frozen','wrong-section','unqualified']){
    const {page,state,context}=await startPage(width,theme,mode);
    if(mode==='stale'){
      await applyButton(page).click();await page.waitForFunction(()=>window.remedyAttempts.at(-1)?.result?.reason==='stale');
      assert(await page.getByRole('alert').count()>0,'Stale refusal not visible');
    }else assert(await applyButton(page).isDisabled(),`${mode} action enabled`);
    assert(await editor(page).locator('[data-application-id]').count()===0,`${mode} produced marks`);
    checks.push({mode,stage:await capture(page,label,mode),requestQualification:qualifyRequests(state),attempts:await page.evaluate(()=>window.remedyAttempts)});
    assert(state.patches.length===0&&state.decisions.length===0,`${mode} performed a governed write`);
    await context.close();
  }
  return checks;
}
function qualifyRequests(state){
  assert(state.patches.length===0,'Remedy lifecycle auto-saved content');
  assert(state.unexpected.length===0,'Unconfigured API path');
  assert(state.consoleErrors.length===0,'Browser console error');assert(state.pageErrors.length===0,'Browser page exception');
  return {requests:state.requests,decisions:state.decisions,patches:state.patches,consoleErrors:state.consoleErrors,pageErrors:state.pageErrors,unexpected:state.unexpected};
}
async function matrix(label,width,theme){
  const report={label,width,theme,status:'pending'};
  try{
    const rejection=await startPage(width,theme,'lifecycle');
    report.rejectionRequests=rejection.state;report.rejection=await fullRejectionAndAcceptance(rejection,label);qualifyRequests(rejection.state);await rejection.context.close();
    const cached=await startPage(width,theme,'cache');
    report.cacheRequests=cached.state;report.cache=await restoreAndDiscard(cached,label);qualifyRequests(cached.state);await cached.context.close();
    report.safeguards=await scopeSafeguards(width,theme,label);
    const stages=[...report.rejection.stages,...report.cache.stages,...report.safeguards.map(s=>s.stage)];
    report.violations=stages.flatMap(s=>s.axe.violations.map(v=>({stage:s.stage,...v})));
    report.status=report.violations.length?'accessibility-fail':'pass';
  }catch(error){report.status='fail';report.error=error.stack;console.error(`${label}: ${error.message}`);}
  writeFileSync(OUT+`/browser-${label}.json`,JSON.stringify(report,null,2)+'\n');console.info(`${label}: ${report.status}`);return report;
}
async function diagnostic(label,width){
  const {page,state,context}=await startPage(width,'light','lifecycle');let failure=null;
  try{await fullRejectionAndAcceptance({page,state},label);}catch(error){failure=error.message;}
  const layout=await page.evaluate(()=>({htmlOverflow:window.getComputedStyle(document.documentElement).overflow,bodyOverflow:window.getComputedStyle(document.body).overflow,scrollTop:document.scrollingElement.scrollTop,scrollHeight:document.scrollingElement.scrollHeight,viewport:window.innerHeight}));
  const data={failure,state,layout,metrics:await measure(page),body:await page.locator('body').innerText(),attempts:await page.evaluate(()=>window.remedyAttempts),states:await page.evaluate(()=>window.remedyStates())};
  await page.screenshot({path:OUT+`/browser-${label}-diagnostic.png`,fullPage:true});
  writeFileSync(OUT+`/browser-${label}-diagnostic.json`,JSON.stringify(data,null,2)+'\n');
  console.info(JSON.stringify({label,failure,unexpected:state.unexpected,viewport:data.metrics.visibleEditableViewport}));await context.close();return data;
}
async function touchPassageSupplement(){
  const {page,state,context}=await startPage(390,'dark','cache');const stages=[];
  try{
    const first=await apply(page);await leaveView(page);
    await page.getByRole('button',{name:'Restore the device draft',exact:true}).click();
    await waitReceiptState(page,'pending');
    stages.push(await capture(page,'touch-dark','restored-pending-passage'));
    await leaveView(page);await page.getByRole('button',{name:'Discard it',exact:true}).click();
    await waitReceiptState(page,'absent');const second=await apply(page);await waitReceiptState(page,'pending');
    assert(first.result.applicationId!==second.result.applicationId,'Supplement retry reused application identity');
    stages.push(await capture(page,'touch-dark','discard-reapplied-passage'));
    const pins=JSON.parse(readFileSync(OUT+'/browser-summary.json','utf8'));
    for(const [name,sha] of Object.entries(pins.sourceSha256))assert(createHash('sha256').update(readFileSync(ROOT+'/client/src/concept2cure/v2/editor/'+name)).digest('hex')===sha,'Production changed before the passage supplement');
    assert(stages.every(s=>s.axe.violations.length===0),'Passage supplement accessibility violation');
    const report={testedHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),sourceSha256:pins.sourceSha256,syntheticApisOnly:true,status:'pass',stages,first,second,requestQualification:qualifyRequests(state)};
    writeFileSync(OUT+'/browser-touch-passage-supplement.json',JSON.stringify(report,null,2)+'\n');
    console.info(JSON.stringify({status:report.status,stages:stages.map(s=>({stage:s.stage,passage:s.passage,visibleEditableViewport:s.metrics.visibleEditableViewport,violations:s.axe.violations.length}))},null,2));
  }finally{await context.close();}
}
try{
  if(process.argv.includes('--diagnostic')){await Promise.all([diagnostic('desktop-light',1440),diagnostic('touch-light',390)]);}else if(process.argv.includes('--touch-passage')){await touchPassageSupplement();}else{
  const results=await Promise.all([matrix('desktop-light',1440,'light'),matrix('desktop-dark',1440,'dark'),matrix('touch-light',390,'light'),matrix('touch-dark',390,'dark')]);
  const sources=['DocumentWorkbench.tsx','AuthoringRemedies.tsx','RichSectionEditor.tsx','suggestions.ts','proposalLifecycle.ts','editorProposalReceipt.ts'];
  const sourceSha256=Object.fromEntries(sources.map(name=>[name,createHash('sha256').update(readFileSync(ROOT+'/client/src/concept2cure/v2/editor/'+name)).digest('hex')]));
  const summary={testedHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),sourceSha256,apiContractSha256:createHash('sha256').update(raw).digest('hex'),completedAt:new Date().toISOString(),syntheticApisOnly:true,contexts:results.map(r=>({label:r.label,status:r.status,violations:r.violations?.length,error:r.error})),limitations:['Synthetic browser fixtures do not qualify live model approval, backend authorization, database audit persistence, RLS or deployment.','The browser uses a two-part replacement and exact saved source/version; broader low-level proposal cases are covered by separate tests.']};
  writeFileSync(OUT+'/browser-summary.json',JSON.stringify(summary,null,2)+'\n');console.info(JSON.stringify(summary,null,2));
}}finally{await browser.close();}
