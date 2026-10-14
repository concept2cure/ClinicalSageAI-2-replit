import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
const ROOT='/workspace/ClinicalSageAI';
const OUT=ROOT+'/docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/ind-templates';
const apiContractText=readFileSync(ROOT+'/.visual-qa/ind-template-eval/api-contract.json','utf8');
const apiContractSha256=createHash('sha256').update(apiContractText).digest('hex');
const contract=JSON.parse(apiContractText);
const testedSourceSha256=Object.fromEntries(['client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx','client/src/concept2cure/v2/editor/DocumentWorkbench.tsx','client/src/concept2cure/v2/styles/rich-section-editor.css'].map(path=>[path,createHash('sha256').update(readFileSync(ROOT+'/'+path)).digest('hex')]));
const PROGRAM='11111111-1111-4111-8111-111111111111';
const TESTED_HEAD='f566951ef78d459355f66eedc14db33b567c473b';
const DATE='2026-10-14T05:00:00.000Z';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const choices=['m1.1.1','m2.5','m3.2.S.1','m4.2.3.1','m5.3.5.1'].map(code=>contract.catalog.sections.find(s=>s.code===code));
function assert(ok,message){if(!ok)throw new Error(message);}
function createMockDocument(request,state,reply) {
  const input=request.postDataJSON();const template=contract.templates.find(t=>t.id===input.template_id);
  assert(!!template,'POST template_id missing from current full provider');
  assert(input.module===template.module,'POST exact module mismatch');
  assert(input.title===template.name,'POST exact template title mismatch');
  assert(input.client_program_id===PROGRAM,'POST wrong program');
  const id=randomUUID();const doc={id,title:input.title,module:input.module,template_id:template.id,client_program_id:PROGRAM,status:'DRAFT',c2c_document_id:null,section_count:template.sections.length,updated_at:DATE,product_code:null,created_by:1,provenance:{source:'template',template:{id:template.id,version:template.version,kind:template.kind,limitations:template.limitations}}};
  const rows=template.sections.map(row=>({id:randomUUID(),doc_id:id,code:row.code,title:row.title,content:'',order_index:row.ordering,updated_at:DATE,track_changes:false,comment_count:0,revision_count:0,citation_count:0}));
  state.docs.set(id,doc);state.sections.set(id,rows);state.posts.push({input,receipt:{success:true,document:doc}});
  return reply({success:true,document:doc},201);
}
function readDocumentApis(path,state,reply) {
  const docmatch=path.match(/^\/api\/authoring\/docs\/([^/]+)$/);
  if(docmatch){const doc=state.docs.get(docmatch[1]);return doc?reply({success:true,document:doc,access:Object.fromEntries(['freeze','esign','esignReview','fileToVault','assignReview','placeIntoFiling'].map(k=>[k,{allowed:true,reason:null}]))}):reply({success:false,message:'Synthetic document absent'},404);}
  const sectionmatch=path.match(/^\/api\/authoring\/docs\/([^/]+)\/sections$/);
  if(sectionmatch)return reply({success:true,sections:state.sections.get(sectionmatch[1])??[],structure:{duplicateCodes:[],outOfOrder:false,suggestedOrder:(state.sections.get(sectionmatch[1])??[]).map(s=>s.id)}});
  const guidancematch=path.match(/^\/api\/authoring\/guidance\/([^/]+)$/);
  if(guidancematch){
    const rows=[...state.sections.values()].flat();const section=rows.find(s=>s.id===guidancematch[1]);
    if(!section)return reply({success:false,message:'Synthetic section absent'},404);
    const doc=state.docs.get(section.doc_id);const template=contract.templates.find(t=>t.id===doc.template_id);const row=template.sections.find(s=>s.code===section.code);
    return reply({success:true,template_guidance:[{...row.guidance,template_source:{id:template.id,version:template.version,kind:template.kind,limitations:template.limitations}}]});
  }
  return null;
}
function readSupplementaryApis(path,url,reply) {
  if(/^\/api\/authoring\/docs\/[^/]+\/citations$/.test(path))return reply([]);
  if(/^\/api\/authoring\/sections\/[^/]+\/sources$/.test(path))return reply({success:true,sources:[]});
  if(/^\/api\/authoring\/documents\/[^/]+\/comments$/.test(path))return reply({success:true,comments:[]});
  if(/^\/api\/authoring\/docs\/[^/]+\/audit$/.test(path))return reply({success:true,events:[]});
  if(path==='/api/data-origins/document')return reply({summary:{documentTable:url.searchParams.get('documentTable'),documentId:url.searchParams.get('documentId'),contentLength:0,attributedChars:0,unattributedChars:0,byKind:{fromSources:0,authorAsserted:0,machineDrafted:0,machineDraftedUnaccepted:0},staleChars:0,spans:[],generatedAt:DATE}});
  if(path===`/api/c2c/projects/${PROGRAM}`)return reply({id:PROGRAM,name:'Synthetic IND browser evaluation',phase:'ind_enabling',program_type:'ind',primary_agency:'FDA',status:'active'});
  if(path===`/api/c2c/projects/${PROGRAM}/sources`)return reply({projectId:PROGRAM,sources:[],total:0,currentTotal:0,page:{limit:Number(url.searchParams.get('limit')),offset:Number(url.searchParams.get('offset'))},window:{shown:0,truncated:false}});
  if(path==='/api/c2c/documents')return reply({documents:[]});
  return null;
}
async function handleApiRoute(route,state) {
  const request=route.request();const url=new URL(request.url());const path=url.pathname;const method=request.method();
  state.requests.push({method,path,query:url.search});
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  const fixed=new Map([
    ['/api/v1/auth/session',{authenticated:true,user:{id:1,email:'synthetic@example.invalid',name:'Synthetic evaluator',organizationId:1,roles:['regulatory-author']}}],
    ['/api/authoring/ind-document-catalog',contract.catalog],
    ['/api/authoring/templates',{templates:contract.templates}],
  ]);
  if(fixed.has(path))return reply(fixed.get(path));
  if(path==='/api/authoring/docs'&&method==='POST')return createMockDocument(request,state,reply);
  if(path==='/api/authoring/docs'&&method==='GET')return reply({documents:[...state.docs.values()]});
  const handled=readDocumentApis(path,state,reply)??readSupplementaryApis(path,url,reply);
  if(handled)return handled;
  state.unexpected.push({method,path,query:url.search});
  return reply({success:false,message:'Unconfigured synthetic fixture endpoint'},404);
}
async function startPage(label,width,theme){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390,isMobile:width===390,colorScheme:theme});
  const page=await context.newPage();
  const state={docs:new Map(),sections:new Map(),requests:[],posts:[],unexpected:[],consoleErrors:[],pageErrors:[]};
  page.on('console',m=>{if(m.type()==='error')state.consoleErrors.push(m.text());});
  page.on('pageerror',e=>state.pageErrors.push(e.message));
  await page.route('**/api/**',route=>handleApiRoute(route,state));
  await page.addInitScript(()=>{localStorage.setItem('trialsage_access_token','synthetic-browser-token');localStorage.setItem('trialsage_user',JSON.stringify({id:1,email:'synthetic@example.invalid',organizationId:1,roles:['regulatory-author']}));});
  await page.goto(`http://127.0.0.1:5175/.visual-qa/ind-template-eval/?theme=${theme}`);
  await page.locator('[data-testid="ind-document-library"] .pf-count').waitFor();
  return {context,page,state,label,width,theme};
}
async function measure(page){
  return page.evaluate(()=>{
    const dimensions=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};};
    const ed=document.querySelector('.ProseMirror[contenteditable="true"]');let visible=null;if(ed){const r=ed.getBoundingClientRect();let x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(window.innerWidth,r.right),bottom=Math.min(window.innerHeight,r.bottom);for(let ancestor=ed.parentElement;ancestor;ancestor=ancestor.parentElement){const style=window.getComputedStyle(ancestor);if(/(auto|scroll|hidden|clip)/.test(style.overflowX+style.overflowY)){const a=ancestor.getBoundingClientRect();x=Math.max(x,a.left);y=Math.max(y,a.top);right=Math.min(right,a.right);bottom=Math.min(bottom,a.bottom);}}visible={x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};}
    return {visibleEditableViewport:visible,viewport:{width:window.innerWidth,height:window.innerHeight},page:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},canvas:dimensions('[data-testid="dc-expanded"]'),editor:dimensions('.ProseMirror[contenteditable="true"]'),documentScroll:dimensions('.ed-doc-scroll'),editorScroll:dimensions('.rse-scroll'),sectionHeading:dimensions('.ed-mast'),editorCount:document.querySelectorAll('.ProseMirror[contenteditable="true"]').length};
  });
}
async function accessibility(page){
  await page.addScriptTag({path:'/workspace/scratch/editor-ui-tools/node_modules/axe-core/axe.min.js'});
  return page.evaluate(async()=>{
    const r=await window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
    return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),passes:r.passes.length};
  });
}
async function inspectLibrary(page,report,label) {
    const count=await page.locator('[data-testid="ind-document-library"] .pf-count').innerText();
    assert(count.startsWith('93 entries'),'Full initial pyramid catalogue missing');report.assertions.push('Full 93-deliverable initial catalogue rendered');
    await page.getByLabel('Find an IND document type').fill('GLP compliance statements');
    const glpRow=page.locator('details.pf-library-entry').first();await glpRow.locator('summary').click();
    const glpText=await glpRow.innerText();assert(glpText.includes('Preparation worksheet')&&glpText.includes('does not replace it'),'GLP original-record limit missing');report.additionalPreparation={title:'GLP compliance statements',text:glpText};
    await page.getByLabel('Find an IND document type').fill('');
    await page.getByRole('button',{name:'Module outlines',exact:true}).click();
    assert((await page.locator('.pf-count').innerText()).startsWith('5 entries'),'Five module outlines absent');
    const outlines=page.locator('details.pf-library-entry');assert(await outlines.count()===5,'Module outlines count');
    for(let i=0;i<5;i++){
      const row=outlines.nth(i);await row.locator('summary').click();
      const ref=contract.catalog.moduleTemplates[i];const text=await row.innerText();
      assert((await row.locator('summary').innerText()).trim()===ref.title,`Module outline label duplicates prefix ${ref.module}`);
      assert(text.includes(ref.title),`Module outline title ${ref.module}`);assert(text.includes(`${ref.sectionCount} sections`),`Module outline section count ${ref.module}`);
      for(const limit of ref.limitations)assert(text.includes(limit),`Module outline limitation ${ref.module}`);
      assert(await row.getByRole('button',{name:'Create from template',exact:true}).isEnabled(),`Module outline create enabled ${ref.module}`);
      report.outlines.push({ref,text,createEnabled:true});
    }
    await page.screenshot({path:OUT+`/browser-${label}-module-outlines.png`,fullPage:true});
    report.libraryAxe=await accessibility(page);report.libraryMetrics=await measure(page);
}
async function inspectGuidanceAndEditor(page,{editor,template,target,result,width,label}) {
  const ref=result.ref;
      const guidance=page.locator('[data-testid="template-guidance"]');await guidance.waitFor();await guidance.locator('summary').click();
      await guidance.locator('.ed-source-detail p').first().waitFor();
      await page.waitForFunction(()=>!document.querySelector('[data-testid="template-guidance"]')?.textContent?.includes('Loading template guidance…'));
      const guideText=await guidance.innerText();const original=template.sections.find(s=>s.code===target.code);
      assert(guideText.includes('separate from authored evidence'),'Guidance separate disclaimer');
      assert(guideText.replace(/\s+/g,' ').includes(original.guidance.guidance_text.replace(/\s+/g,' ').trim()),'Current saved template guidance absent');
      for(const check of original.guidance.compliance_checklist??[])assert(guideText.includes(check),'Source requirement absent');
      for(const reference of original.guidance.regulatory_references??[])assert(guideText.includes(reference),'Regulatory reference absent');
      for(const limit of template.limitations)assert(guideText.includes(limit),'Template provenance limits absent');
      if(ref.kind==='preparation')assert(guideText.includes('does not replace it'),'Original official output limit absent');
      result.guidance={text:guideText,regulatoryReferences:original.guidance.regulatory_references,sourceChecks:original.guidance.compliance_checklist,authoredBodyEmpty:(await editor.innerText()).trim()===''};
      result.guidanceAxe=await accessibility(page);result.guidanceMetrics=await measure(page);
      await guidance.locator('summary').scrollIntoViewIfNeeded();
      await page.screenshot({path:OUT+`/browser-${label}-${ref.module}-guidance.png`,fullPage:true});
      await guidance.locator('summary').click();
      await editor.scrollIntoViewIfNeeded();
      result.emptyEditorMetrics=await measure(page);result.emptyEditorAxe=await accessibility(page);
      assert(!(await page.locator('body').innerText()).includes('Attribution could not be read'),'Attribution mock contract warning');
      const bbox=await editor.boundingBox();assert(bbox&&bbox.width>=250&&bbox.height>50,'Editing canvas too small');
      assert(result.emptyEditorMetrics.page.scrollWidth<=width,'Page horizontal overflow');
      assert(result.emptyEditorMetrics.editorCount===1,'More than one existing editor');
      assert(result.emptyEditorMetrics.visibleEditableViewport.width>=250&&result.emptyEditorMetrics.visibleEditableViewport.height>=120,'Visible editing viewport inaccessible');
      assert(bbox.y< (width===390?844:1000) && bbox.y+bbox.height>0,'Editor out of viewport');
      await page.screenshot({path:OUT+`/browser-${label}-${ref.module}-empty-editor.png`,fullPage:true});
}
async function inspectModule(page,state,width,label,i) {
      const item=choices[i];const ref=item.template;const template=contract.templates.find(t=>t.id===ref.id);const result={module:ref.module,canonicalCode:item.code,ref,sectionCount:template.sections.length};
      await page.getByLabel('Module',{exact:true}).selectOption(ref.module);
      await page.getByLabel('Find an IND document type').fill(item.code);
      const row=page.locator('details.pf-library-entry').filter({has:page.locator('summary',{hasText:`${item.code} · ${item.title}`})}).first();
      await row.locator('summary').click();
      assert((await row.innerText()).includes(ref.kind==='preparation'?'Preparation worksheet':'Narrative working outline'),'Kind in library');
      await row.getByRole('button',{name:ref.aiDraftable?'Work with AnA':'Prepare with AnA',exact:true}).click();
      const anaHandoff=await page.evaluate(()=>window.evalAskEvents.at(-1));assert(anaHandoff.includes(ref.id)&&anaHandoff.includes('get_document_template')&&anaHandoff.includes('follow every page')&&anaHandoff.includes('source requirements'),'Library AnA handoff lacks exact UUID/source tool');result.anaHandoff=anaHandoff;
      const before=state.posts.length;
      if(i===0)await page.evaluate(()=>{window.evalHeld=true;});
      await row.getByRole('button',{name:'Create from template',exact:true}).click();
      await row.getByRole('button',{name:'Open working copy',exact:true,includeHidden:true}).waitFor({state:'attached'});
      assert(state.posts.length===before+1,'Exactly one native create');
      result.post=state.posts.at(-1);
      if(i===0){
        assert(await page.locator('.ProseMirror[contenteditable="true"]').count()===0,'Held callback opened editor');
        await page.evaluate(()=>{window.evalHeld=false;});
        await row.getByRole('button',{name:'Open working copy',exact:true}).click();
        assert(state.posts.length===before+1,'Held callback retry duplicated POST');
        result.heldCallbackNoDuplicate=true;
      }
      const docId=state.posts.at(-1).receipt.document.id;
      await page.locator(`[data-testid="document-canvas"][data-doc-id="${docId}"]`).waitFor({state:'attached'});
      const editor=page.locator('.ProseMirror[contenteditable="true"]');await editor.waitFor();
      await page.waitForFunction(id=>window.evalBridge?.docId===id,docId);
      assert(await editor.count()===1,'Exactly one native TipTap');
      assert(await page.locator('[data-testid="access-rail-open"]').count()===1,'Merged Access action missing');result.mergedAccessActionPresent=true;
      assert((await editor.innerText()).trim()==='','New editor authored body empty');
      const currentSections=state.sections.get(docId);assert(currentSections.every(s=>s.content===''),'Saved mock sections all empty');
      assert(result.post.receipt.document.c2c_document_id===null,'Native copy bound to filing');
      result.initialBridge=await page.evaluate(()=>window.evalBridge);
      const target=currentSections[Math.min(1,currentSections.length-1)];
      await page.locator('.ed-tree-row').filter({hasText:target.title}).last().click();
      await page.waitForFunction(id=>window.evalBridge?.sectionId===id,target.id);
      assert((await editor.innerText()).trim()==='','Selected section authored body empty');
      result.selectedSection={id:target.id,code:target.code,title:target.title,bridge:await page.evaluate(()=>window.evalBridge)};
      await inspectGuidanceAndEditor(page,{editor,template,target,result,width,label});
      // Real existing section guard: typing then cancel preserves current section and body.
      if(i===0){
        await editor.fill('Synthetic local draft for unsaved-work validation.');
        const next=currentSections[2];await page.locator('.ed-tree-row').filter({hasText:next.title}).last().click();
        await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
        assert((await page.evaluate(()=>window.evalBridge.sectionId))===target.id,'Cancel changed section');
        assert((await editor.innerText()).includes('Synthetic local draft'),'Cancel lost local draft');
        await page.locator('.ed-tree-row').filter({hasText:next.title}).last().click();
        await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
        await page.waitForFunction(id=>window.evalBridge?.sectionId===id,next.id);
        assert((await editor.innerText()).trim()==='','Second saved section was not empty');
        assert(state.posts.length===before+1,'Unsaved guard caused create');result.unsavedSectionGuardCancel=true;
      }
      await page.getByRole('button',{name:'Documents (1)',exact:true}).click();
      await row.getByRole('button',{name:'Open working copy',exact:true}).click();
      await page.waitForFunction(id=>window.evalBridge?.docId===id,docId);
      assert(state.posts.length===before+1,'Reopen duplicate native POST');result.reopenNoDuplicate=true;
      await page.getByRole('button',{name:'Documents (1)',exact:true}).click();
  return result;
}
async function matrix(label,width,theme){
  const env=await startPage(label,width,theme);const {page,state,context}=env;
  const report={label,width,theme,modules:[],outlines:[],assertions:[],violations:[],requests:[],consoleErrors:[],pageErrors:[]};
  try {
    await inspectLibrary(page,report,label);
    await page.getByRole('button',{name:'CTD sections',exact:true}).click();
    for(let i=0;i<choices.length;i++){
      const result=await inspectModule(page,state,width,label,i);
      report.modules.push(result);
      console.info(`${label} ${result.module} passed native create, guide, empty editor, reopen`);
    }
    report.assertions.push('All five module representatives created in one existing editor with exact identity and unbound DRAFT receipts','Held native-create callback and working-copy reopens produced no duplicate POST','Existing section unsaved-work guard cancel kept local text and section','All five module-outline refs expose section counts, original format and limits','All selected authored bodies started empty and source guidance remained separate');
    report.openEvents=await page.evaluate(()=>window.evalEvents);report.requests=state.requests;report.posts=state.posts;report.unexpected=state.unexpected;report.consoleErrors=state.consoleErrors;report.pageErrors=state.pageErrors;
    assert(state.unexpected.length===0,'Unconfigured API route');assert(state.pageErrors.length===0,'Browser page exception');assert(state.consoleErrors.length===0,'Browser console error');
    report.violations=[...(report.libraryAxe.violations.map(v=>({surface:'library',...v}))),...report.modules.flatMap(m=>[...m.guidanceAxe.violations.map(v=>({module:m.module,surface:'guidance',...v})),...m.emptyEditorAxe.violations.map(v=>({module:m.module,surface:'empty-editor',...v}))])];
    report.status=report.violations.length?'accessibility-fail':'pass';
  }catch(e){report.status='fail';report.error=e.stack;report.requests=state.requests;report.posts=state.posts;report.unexpected=state.unexpected;report.consoleErrors=state.consoleErrors;report.pageErrors=state.pageErrors;await page.screenshot({path:OUT+`/browser-${label}-failure.png`,fullPage:true}).catch(()=>{});console.error(`${label} FAIL ${e.message}`);}
  writeFileSync(OUT+`/browser-${label}.json`,JSON.stringify(report,null,2)+'\n');
  await context.close();return report;
}
try{
  const results=await Promise.all([matrix('desktop-light',1440,'light'),matrix('desktop-dark',1440,'dark'),matrix('touch-light',390,'light'),matrix('touch-dark',390,'dark')]);
  const summary={fixture:'Current full 200-template provider/catalog; synthetic isolated API; actual library → canvas → workbench → TipTap',browser:'Chromium /usr/bin/chromium',createdAt:new Date().toISOString(),apiContractSha256,testedHead:TESTED_HEAD,testedSourceSha256,templateCount:contract.templates.length,canonicalSections:contract.catalog.sections.length,canonicalDeliverables:contract.catalog.deliverables.length,moduleOutlines:contract.catalog.moduleTemplates.length,emptyOutlineSections:contract.templates.reduce((n,t)=>n+t.sections.filter(s=>s.content==='').length,0),contexts:results.map(r=>({label:r.label,status:r.status,completedModules:r.modules.length,createdDocuments:r.posts.length,violations:r.violations.length,pageErrors:r.pageErrors,consoleErrors:r.consoleErrors,error:r.error})),limitations:['Browser API data is synthetic; this evaluates native client behavior, layout and accessibility, not live server authorization or persistence.','Only five representative section templates per context are created; full template completeness is separately evidenced by current provider JSON and server/database checks.']};
  writeFileSync(OUT+'/browser-summary.json',JSON.stringify(summary,null,2)+'\n');console.info(JSON.stringify(summary,null,2));
} finally {await browser.close();}
