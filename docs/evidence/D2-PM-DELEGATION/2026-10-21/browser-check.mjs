/** Actual assignment component/request helper/CSS; synthetic tenant and HTTP.
 * This is component browser evidence, not deployed authentication evidence. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { launchChromium } from '../../../../scripts/visual-qa/playwright.mjs';
const repo = fileURLToPath(new URL('../../../../',import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2])+'/' : fileURLToPath(new URL('./',import.meta.url));
mkdirSync(out,{recursive:true});
const require = createRequire(new URL('../../../../package.json',import.meta.url));
const {build} = require('esbuild');
const bundle = await build({
  stdin:{resolveDir:repo,loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {TaskAssignmentControls} from './client/src/concept2cure/v2/surfaces/TaskAssignmentControls';
    sessionStorage.setItem('trialsage_access_token','fixture.'+btoa(JSON.stringify({userId:7,organizationId:9}))+'.unsigned');
    createRoot(document.getElementById('root')).render(<TaskAssignmentControls taskId='TASK-DELEGATE' projectId={11} status='in-progress'
      actorScope={{userId:'7',organizationId:'9'}} isCurrent={()=>true} onSaved={()=>{window.saved=(window.saved||0)+1;}}/>);
  `},bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},
  plugins:[{name:'synthetic-tenant',setup(b){
    b.onResolve({filter:/^@\/contexts\/TenantContext$/},args=>({path:args.path,namespace:'synthetic'}));
    b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({loader:'js',contents:'export const useTenant=()=>({currentOrganization:{id:9},currentClientWorkspace:{id:71,organizationId:9}});'}));
  }}],
});
const css=['design-system/colors_and_type.css','client/src/concept2cure/v2/styles/app-v2.css'].map(path=>readFileSync(repo+path,'utf8')).join('\n');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0;min-height:100%}main{max-width:760px;margin:auto;padding:18px}.tb-detail{position:relative;min-height:900px;height:auto;width:auto}</style><body class="c2c-v2"><main><div class="tb-detail"><h3>Validation handoff</h3><p>Task detail · synthetic qualification</p><div id="root"></div></div></main><script src="/bundle.js"></script>`;
let assigneeId=8,version='a'.repeat(64),reads=0;
const writes=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(!req.url.startsWith('/api/')){assigneeId=8;version='a'.repeat(64);reads=0;res.setHeader('Content-Type','text/html');res.end(html);return;}
  res.setHeader('Content-Type','application/json');
  const mode=new URL(req.headers.referer||'http://fixture/').searchParams.get('mode');
  assert.equal(req.headers['x-client-id'],'71');assert.ok(req.headers.authorization);
  if(req.method==='GET'){
    reads++;
    if(mode==='error'){res.statusCode=503;res.end(JSON.stringify({success:false,error:'UNAVAILABLE',message:'Task assignment could not be verified.'}));return;}
    const candidates=[{id:'7',name:'Project manager',label:'Project manager'},{id:'8',name:'Alex Chen',label:'Alex Chen · one@example.test'},{id:'9',name:'Alex Chen',label:'Alex Chen · two@example.test'}];
    const data=mode==='reader'?[]:mode==='empty'?candidates.filter(row=>row.id===String(assigneeId)):candidates;
    res.end(JSON.stringify({success:true,data,total:data.length,meta:{organizationId:9,actorUserId:7,taskId:'TASK-DELEGATE',projectId:11,clientWorkspaceId:71,status:'in-progress',canAssign:mode!=='reader',assigneeId,assignmentVersion:version}}));return;
  }
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);writes.push({method:req.method,body,workspaceBound:true,actorBound:true});
  if(mode==='unknown'){res.statusCode=500;res.end(JSON.stringify({success:false,error:'OUTCOME_UNKNOWN',message:'Whether this change was saved is unknown. Reload to see the task’s current state before trying again.'}));return;}
  if(req.method==='PATCH'){
    assert.equal(body.expectedAssigneeId,assigneeId);assert.equal(body.expectedVersion,version);assert.equal(body.action,'assign');assert.ok(body.reason.length>=3);
    assigneeId=body.assigneeId;version='b'.repeat(64);
    res.end(JSON.stringify({success:true,data:{taskId:'TASK-DELEGATE',organizationId:9,actorUserId:7,projectId:11,clientWorkspaceId:71,status:'in-progress',assigneeId,assigneeName:'Alex Chen',assignedBy:7,assignedAt:'2026-10-21T00:00:00.000Z',assignmentVersion:version}}));return;
  }
  assert.equal(body.expectedAssignments[0].expectedVersion,version);assigneeId=9;version='c'.repeat(64);
  res.end(JSON.stringify({success:true,count:1,data:[{taskId:'TASK-DELEGATE',assigneeId:9,assigneeName:'Alex Chen'}]}));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,lastPage;const results=[];
try{
  browser=await launchChromium({executablePath:process.env.PLAYWRIGHT_CHROMIUM||'/usr/bin/chromium'});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:1100}});lastPage=page;const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);assert.equal(reads,0);
    await page.getByRole('button',{name:'Change assignee',exact:true}).click();
    await page.getByRole('combobox',{name:/^New assignee/}).selectOption('9');
    await page.getByLabel('Reason for assignment',{exact:true}).fill('Cover the validation handoff');
    await page.screenshot({path:out+`assignment-form-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Save assignment',exact:true}).click();
    await page.getByText('Current assignee:',{exact:false}).filter({hasText:'two@example.test'}).waitFor();
    await page.getByText('Saved assignee: Account #9.',{exact:false}).waitFor();
    await page.screenshot({path:out+`assignment-saved-${width}.png`,fullPage:true});
    const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.viewport,JSON.stringify(layout));
    await page.goto(origin+'/?mode=reader');await page.getByRole('button',{name:'Change assignee',exact:true}).click();
    await page.getByText('This task cannot currently be reassigned.',{exact:false}).waitFor();assert.equal(await page.getByRole('combobox',{name:/^New assignee/}).count(),0);
    await page.goto(origin+'/?mode=empty');await page.getByRole('button',{name:'Change assignee',exact:true}).click();
    await page.getByText('No other eligible colleagues are available for this task.',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Save assignment',exact:true}).isDisabled());
    await page.goto(origin+'/?mode=error');await page.getByRole('button',{name:'Change assignee',exact:true}).click();await page.getByRole('button',{name:'Retry assignment read',exact:true}).waitFor();
    await page.goto(origin+'/?mode=unknown');await page.getByRole('button',{name:'Change assignee',exact:true}).click();
    await page.getByRole('combobox',{name:/^New assignee/}).selectOption('9');await page.getByLabel('Reason for assignment',{exact:true}).fill('Cover the validation handoff');
    await page.getByRole('button',{name:'Save assignment',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not confirm'}).waitFor();
    assert.ok(await page.getByRole('button',{name:'Auto-assign task',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:'Save assignment',exact:true}).isDisabled());
    await page.screenshot({path:out+`assignment-unconfirmed-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Refresh assignment',exact:true}).click();await page.getByRole('combobox',{name:/^New assignee/}).waitFor();
    await page.goto(origin);await page.getByRole('button',{name:'Auto-assign task',exact:true}).click();
    await page.getByText('Current assignee:',{exact:false}).filter({hasText:'two@example.test'}).waitFor();
    assert.deepEqual(errors,[]);results.push({width,lazyRead:true,namedHandoff:true,realReason:true,rereadSaved:true,readerControlsHidden:true,emptyHonest:true,readRetry:true,unknownBlocksReplay:true,automaticUsesScopedVersion:true,horizontalOverflow:false,pageErrors:errors});await page.close();
  }
  assert.equal(writes.length,6);writeFileSync(out+'browser-result.json',JSON.stringify({fixture:'actual component/request helper/product CSS; synthetic tenant/auth/API',results,writes},null,2)+'\n');
}catch(error){if(lastPage&&!lastPage.isClosed()){writeFileSync(out+'browser-diagnostic.html',await lastPage.content());await lastPage.screenshot({path:out+'browser-diagnostic.png',fullPage:true});}throw error;
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
