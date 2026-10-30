/** Actual read-only cards/helpers/CSS, synthetic auth/tenant/API; no deployed claim. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { launchChromium } from '../../../../scripts/visual-qa/playwright.mjs';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const out = fileURLToPath(new URL('./browser/', import.meta.url)); mkdirSync(out, { recursive: true });
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { build } = require('esbuild');
const programId = '11111111-1111-4111-8111-111111111111';
const bundle = await build({ stdin: { resolveDir: repo, loader: 'tsx', contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {ProjectRecordedContext} from './client/src/concept2cure/v2/surfaces/ProjectRecordedContext';
  import {publishShellProject} from './client/src/concept2cure/v2/shellProject';
  import {setAuthToken} from './client/src/utils/authToken';
  window.fixture={user:{id:'7',organizationId:'9',role:'member'},revision:1,listeners:[],workspace:{id:'71',organizationId:'9'}};
  const token=actor=>'x.'+btoa(JSON.stringify({userId:actor,organizationId:9}))+'.fixture';setAuthToken(token(7));
  publishShellProject({id:'${programId}',title:'Current project'});
  const root=createRoot(document.getElementById('root'));
  const mount=()=>root.render(<div className="pj"><aside className="pj-side"><ProjectRecordedContext programId="${programId}"/></aside></div>);mount();
  window.switchActor=()=>{window.fixture.user={id:'8',organizationId:'9',role:'member'};window.fixture.revision++;setAuthToken(token(8));window.fixture.listeners.slice().forEach(fn=>fn());mount();};
  window.refreshToken=()=>{setAuthToken(token(7)+'-refreshed');window.fixture.listeners.slice().forEach(fn=>fn());mount();};
` }, bundle: true, write: false, outfile: '/tmp/context-browser.js', format: 'iife', define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': '{}' },
  plugins: [{ name: 'synthetic-auth-and-tenant', setup(b) {
    b.onResolve({filter:/^@\/services\/portal\/authService$/},args=>({path:args.path,namespace:'fixture-auth'}));
    b.onResolve({filter:/^@\/contexts\/TenantContext$/},args=>({path:args.path,namespace:'fixture-tenant'}));
    b.onLoad({filter:/.*/,namespace:'fixture-auth'},()=>({loader:'js',contents:`export const useAuthUser=()=>window.fixture.user;
      export const authService={getUser:()=>window.fixture.user,captureSessionReadGuard:()=>{const r=window.fixture.revision;return{sameRevision:()=>r===window.fixture.revision};},on:(_e,fn)=>{window.fixture.listeners.push(fn);return()=>{window.fixture.listeners=window.fixture.listeners.filter(x=>x!==fn);};}};`}));
    b.onLoad({filter:/.*/,namespace:'fixture-tenant'},()=>({loader:'js',contents:'export const useTenant=()=>({currentOrganization:{id:9},currentClientWorkspace:window.fixture.workspace});'}));
  }}],
});
const js = bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css = ['design-system/colors_and_type.css','client/src/concept2cure/v2/styles/app-v2.css','client/src/concept2cure/v2/styles/project-home-v2.css'].map(p=>readFileSync(repo+p,'utf8')).join('\n')+bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}.pj{padding:20px}.pj-side{max-width:440px}</style><body class="c2c-v2"><div id="root"></div><script src="/bundle.js"></script>`;
const reads=[];const attempts=new Map();
function data(actor,mode) { return {programId,projectId:21,organizationId:9,actorUserId:mode==='foreign'?99:actor,clientWorkspaceId:71,profile:mode==='absent'?null:{
  profileId:3,regulatoryStrategy:actor===7?'Recorded project strategy':'Current second actor strategy',targetIndication:null,targetPopulation:null,
  customInstructions:'Use the recorded product nomenclature.',riskFactors:Array.from({length:6},(_,i)=>({risk:`Recorded risk ${i+1}`,likelihood:'Not assessed',impact:'Recorded concern'})),
  openQuestions:[],keyDecisions:[{decision:'Retain the comparator',rationale:'Client decision',date:'2026-10-29',source:'recorded-source-'+ 'x'.repeat(250)}],
  learnedInsights:[{insight:'Recorded observation',source:'Source report',confidence:null,extractedAt:'2026-10-29'}],lastEnrichedAt:'2026-10-29T12:00:00.000Z',
}};}
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
  if(!req.url.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const mode=new URL(req.headers.referer||'http://fixture/').searchParams.get('mode')||'normal';
  assert.equal(req.method,'GET');assert.equal(req.headers['x-organization-id'],'9');assert.equal(req.headers['x-client-id'],'71');
  const actor=JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64').toString()).userId;
  reads.push({mode,actor,method:req.method});attempts.set(mode,(attempts.get(mode)||0)+1);res.setHeader('Content-Type','application/json');
  if(mode==='error'||mode==='retry'&&attempts.get(mode)===1){res.statusCode=503;res.end(JSON.stringify({error:'UNAVAILABLE'}));return;}
  if(mode==='late'&&actor===7)await new Promise(done=>setTimeout(done,700));
  const result=data(actor,mode);if(mode==='malformed')result.profile.riskFactors={unread:true};
  res.end(JSON.stringify({success:true,data:result}));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,last;const results=[];
try {
  browser=await launchChromium({executablePath:'/usr/bin/chromium'});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:1050}});last=page;const errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.goto(origin);await page.getByText('Recorded project strategy',{exact:true}).waitFor();
    await page.getByText('Use the recorded product nomenclature.',{exact:true}).waitFor();
    await page.getByText('Showing 5 of 6 recorded risks.',{exact:true}).waitFor();
    assert.equal(await page.getByText('Recorded risk 6',{exact:true}).count(),0);await page.getByText('Confidence not recorded.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/save|enrich|approve/i}).count(),0);
    const before=reads.length;await page.evaluate(()=>window.refreshToken());await page.waitForTimeout(100);assert.equal(reads.length,before);
    const layout=await page.evaluate(()=>({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.viewport,JSON.stringify(layout));
    await page.screenshot({path:out+`recorded-context-${width}.png`,fullPage:true});
    await page.goto(origin+'/?mode=absent');await page.getByText('No saved intelligence profile for this project.',{exact:true}).waitFor();
    for(const mode of ['error','foreign','malformed']){await page.goto(origin+'/?mode='+mode);await page.getByRole('alert').first().waitFor();assert.equal(await page.getByText('Recorded project strategy',{exact:true}).count(),0);}
    attempts.delete('retry');await page.goto(origin+'/?mode=retry');await page.getByRole('button',{name:'Retry recorded project context',exact:true}).click();await page.getByText('Recorded project strategy',{exact:true}).waitFor();
    await page.goto(origin+'/?mode=late');await page.getByText('Reading saved project profile…',{exact:true}).first().waitFor();await page.evaluate(()=>window.switchActor());
    await page.getByText('Current second actor strategy',{exact:true}).waitFor();await page.waitForTimeout(800);assert.equal(await page.getByText('Recorded project strategy',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);results.push({width,recordedSourceAndInstructions:true,boundedLists:true,unknownConfidenceHonest:true,noWriteControls:true,tokenRefreshRetained:true,failedAndForeignReadsHidden:true,explicitRetry:true,lateActorReplyRetired:true,horizontalOverflow:false,pageErrors:errors});await page.close();
  }
  writeFileSync(out+'result.json',JSON.stringify({fixture:'Actual recorded-context component/shared guards/session/shell/request helpers and product CSS; synthetic auth, tenant and API.',results,reads},null,2)+'\n');
  process.stdout.write(JSON.stringify({results,readCount:reads.length},null,2)+'\n');
}catch(e){if(last&&!last.isClosed()){await last.screenshot({path:out+'error.png',fullPage:true});writeFileSync(out+'error.html',await last.content());}throw e;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
