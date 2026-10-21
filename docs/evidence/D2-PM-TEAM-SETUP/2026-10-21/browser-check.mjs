/** Actual component, product CSS and request helper with synthetic auth/tenant
 * providers and an in-memory HTTP fixture. Not deployed E2E/auth evidence. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { launchChromium } from '../../../../scripts/visual-qa/playwright.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2]) + '/' : fileURLToPath(new URL('./', import.meta.url));
mkdirSync(out, { recursive: true });
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { build } = require('esbuild');
const program = '11111111-1111-4111-8111-111111111111';
const owner = {userId:7,role:'owner',status:'active',addedById:null,addedAt:null,explicit:false,implicitSources:['project_owner','project_creator'],canSetRole:false,canRevoke:false};
const share = id => ({userId:id,role:id===8?'use':'edit',status:'active',addedById:7,addedAt:'2026-10-21T00:00:00.000Z',explicit:true,implicitSources:[],canSetRole:true,canRevoke:true});
const candidates = [{userId:7,label:'Project manager'},{userId:8,label:'Alex Chen · alex@example.test'},{userId:9,label:'Alex Chen · other@example.test'}];
let members = [owner,share(8)];
const writes = [];
const bundle = await build({
  stdin: {resolveDir:repo,loader:'tsx',contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {ProjectTeamSharing} from './client/src/concept2cure/v2/surfaces/ProjectTeamSharing';
    sessionStorage.setItem('trialsage_access_token','fixture.'+btoa(JSON.stringify({userId:7,organizationId:9}))+'.unsigned');
    createRoot(document.getElementById('root')).render(<ProjectTeamSharing programId='${program}' projectId={11} onChanged={()=>{}}/>);
  `},
  bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},
  plugins:[{name:'synthetic-providers',setup(b){
    b.onResolve({filter:/^@\/(services\/portal\/authService|contexts\/TenantContext)$/},args=>({path:args.path,namespace:'synthetic'}));
    b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({loader:'js',contents:args.path.includes('authService')?
      'export const useAuthUser=()=>({id:7,organizationId:9});':
      'export const useTenant=()=>({currentOrganization:{id:9},currentClientWorkspace:{id:71,organizationId:9}});'}));
  }}],
});
const css = ['design-system/colors_and_type.css','client/src/concept2cure/v2/styles/app-v2.css','client/src/concept2cure/v2/styles/project-home-v2.css'].map(path=>readFileSync(repo+path,'utf8')).join('\n');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0;min-height:100%}main{max-width:960px;margin:auto;padding:24px}</style><body class="c2c-v2"><main><p>Synthetic PM-04a component check</p><section class="pj-sec"><div class="pj-sec-h"><h2>Team &amp; activity</h2></div><div id="root"></div></section></main><script src="/bundle.js"></script>`;
const server = createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(!req.url.startsWith('/api/')){members=[owner,share(8)];res.setHeader('Content-Type','text/html');res.end(html);return;}
  const mode = new URL(req.headers.referer||'http://fixture/').searchParams.get('mode');
  res.setHeader('Content-Type','application/json');
  if(mode==='error'){res.statusCode=503;res.end(JSON.stringify({success:false,message:'Sharing verification is unavailable.'}));return;}
  const url=new URL(req.url,'http://fixture');
  assert.equal(url.searchParams.get('programId'),program);
  assert.equal(req.headers['x-client-id'],'71');
  if(req.method!=='GET'){
    let raw='';for await(const chunk of req) raw+=chunk;
    const id=Number(url.pathname.split('/').at(-1));
    const body=raw?JSON.parse(raw):null;
    writes.push({method:req.method,userId:id,role:body?.role,programBound:true,workspaceBound:true,actorHeader:Boolean(req.headers.authorization)});
    members=members.filter(member=>member.userId!==id);
    if(req.method==='PUT')members.push({...share(id),role:body.role});
  }
  const canManage=mode!=='reader';
  const data={projectId:'proj_11',visibility:'private',legacyFallbackApplied:false,members:members.map(member=>({...member,canSetRole:canManage&&member.canSetRole,canRevoke:canManage&&member.canRevoke})),programId:program,organizationId:9,clientWorkspaceId:71,actorUserId:7,canManage,candidates:canManage?candidates:[]};
  res.end(JSON.stringify({success:true,data,meta:{auditTrail:{persisted:mode!=='audit-warning',chained:false}}}));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const results=[];
try{
  browser=await launchChromium({executablePath:process.env.PLAYWRIGHT_CHROMIUM||'/usr/bin/chromium'});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:1100}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);
    await page.getByRole('button',{name:'Grant sharing',exact:true}).waitFor();
    await page.getByLabel(/^Organization member/).selectOption('9');
    await page.getByLabel(/^New sharing role/).selectOption('edit');
    await page.getByRole('button',{name:'Grant sharing',exact:true}).click();
    const revoke=page.getByRole('button',{name:'Revoke explicit share for Alex Chen · other@example.test',exact:true});
    await revoke.waitFor();
    await page.screenshot({path:out+`sharing-manager-${width}.png`,fullPage:true});
    const layout=await page.evaluate(()=>({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(layout.scroll<=layout.viewport,JSON.stringify(layout));
    await revoke.click();
    await page.getByRole('button',{name:'Confirm revoke share',exact:true}).click();
    await revoke.waitFor({state:'detached'});
    await page.goto(origin+'/?mode=reader');
    await page.getByRole('button',{name:'Refresh sharing',exact:true}).waitFor();
    await page.getByText('Private project: access follows its recorded sharing and organization policy.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Grant sharing',exact:true}).count(),0);
    await page.screenshot({path:out+`sharing-reader-${width}.png`,fullPage:true});
    await page.goto(origin+'/?mode=error');
    await page.getByRole('button',{name:'Retry sharing',exact:true}).waitFor();
    await page.goto(origin+'/?mode=audit-warning');
    await page.getByLabel(/^Organization member/).selectOption('9');
    await page.getByLabel(/^New sharing role/).selectOption('use');
    await page.getByRole('button',{name:'Grant sharing',exact:true}).click();
    await page.getByRole('alert').filter({hasText:/audit entry/}).waitFor();
    assert.deepEqual(errors,[]);
    results.push({width,grant:'passed',revoke:'passed',readerControlsHidden:true,readError:'honest retry',auditWarning:'shown',horizontalOverflow:false,pageErrors:errors});
    await page.close();
  }
  assert.equal(writes.length,6);
  writeFileSync(out+'browser-result.json',JSON.stringify({fixture:'actual component + request helper/product CSS; synthetic auth/tenant/API',results,writes},null,2)+'\n');
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
