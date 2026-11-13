// Extended copy of the immutable codespaces-demo-continuation/reviewer-walk.cjs.
// Run with Node 22, installed Playwright and CHROMIUM_PATH; no provider required.
const { chromium }=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const { createHash }=require('node:crypto');
const out=__dirname;
const downloads=path.join('/workspace/scratch/c2c-demo-downloads',new Date().toISOString().replace(/[:.]/g,'-'));
const measurements={sections:null,document:null,exports:[],failures:[]};

function requireCheck(ok,message) {
 if(!ok)throw Error(message);
}

function classifyRequestFailure(request) {
 const path=new URL(request.url()).pathname;
 const method=request.method();
 const error=request.failure()?.errorText??'unknown';
 // Keep required editor reads fatal even when the browser reports cancellation.
 // Other GET cancellations remain recorded separately from transport failures.
 const requiredRead=/^\/api\/authoring\/docs\/[^/]+(?:\/sections)?$/.test(path)||/^\/api\/authoring\/sections\/[^/]+$/.test(path);
 const cancelledGet=method==='GET'&&error==='net::ERR_ABORTED'&&!requiredRead;
 return {method,path,error,classification:cancelledGet?'client-cancelled-get':'transport-failure'};
}

function textChecks(text) {
 const normalized=text.replace(/\s+/g,' ');
 return {draft:/\bDRAFT\b/.test(normalized),uncontrolled:/uncontrolled\s+copy/i.test(normalized)};
}

function inspectWord(bytes) {
 const AdmZip=require('adm-zip');
 const zip=new AdmZip(bytes);
 const parts=zip.getEntries().filter(entry=>/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(entry.entryName));
 const xmlChecks=parts.map(entry=>({part:entry.entryName,...textChecks(entry.getData().toString('utf8').replace(/<[^>]*>/g,' '))}));
 const checks=textChecks(parts.map(entry=>entry.getData().toString('utf8').replace(/<[^>]*>/g,' ')).join(' '));
 return {reader:'adm-zip',documentXml:parts.some(entry=>entry.entryName==='word/document.xml'),xmlChecks,...checks};
}

async function inspectPdf(bytes) {
 const { PDFParse }=require('pdf-parse');
 const parser=new PDFParse({data:new Uint8Array(bytes)});
 try {
  const parsed=await parser.getText();
  const checks=textChecks(parsed.text);
  return {reader:'pdf-parse',pageCount:parsed.total??parsed.pages?.length??null,textCharacters:parsed.text.length,...checks};
 }finally{await parser.destroy();}
}

async function within(promise,milliseconds) {
 let timer;
 try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Browser download did not arrive after its response')),milliseconds);})]);}
 finally{clearTimeout(timer);}
}

async function measureSections(response,header) {
 const body=await response.json();
 const documentBody=await header.json();
 const rows=Array.isArray(body.sections)?body.sections:[];
 measurements.document={httpStatus:header.status(),id:documentBody.document?.id??null,title:documentBody.document?.title??null,status:documentBody.document?.status??null};
 measurements.sections={httpStatus:response.status(),path:new URL(response.url()).pathname,readScope:body.readScope??null,reportedCount:body.count??null,
  actualCount:rows.length,nonemptySavedBodies:rows.filter(row=>typeof row.content==='string'&&row.content.trim().length>0).length};
 requireCheck(response.ok()&&header.ok()&&body.success===true,'Document or sections read did not succeed');
 requireCheck(measurements.document.title?.includes('LMN-301 Phase 2a Viral Challenge Clinical Study Report'),'Unexpected document header');
 requireCheck(body.readScope==='document','Sections response is not a whole-document projection');
 requireCheck(rows.length===119&&measurements.sections.nonemptySavedBodies===119,'Actual CSR sections are not 119/119 populated');
 requireCheck(rows.every(row=>row.doc_id===measurements.document.id),'Section/header document identity differs');
}

async function measureWorkingCopy(page,format) {
 const record={format,httpStatus:null,downloaded:false};
 measurements.exports.push(record);
 let onDownload;
 try {
  await page.getByTestId('ed-download').getByRole('button',{name:'Download',exact:true}).click();
  record.controlledItems=await page.getByTestId('dlm-menu').getByRole('menuitem').evaluateAll(items=>items.filter(item=>item.textContent.includes('Controlled export')).map(item=>({label:item.getAttribute('aria-label'),disabled:item.getAttribute('aria-disabled')})));
  const downloadPromise=new Promise(resolve=>{onDownload=resolve;page.once('download',onDownload);});
  const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/authoring/docs/${measurements.document.id}/working-copy`).then(response=>({response}),error=>({error}));
  await page.getByTestId(`dlm-wc-${format}`).click();
  const received=await responsePromise;
  if(received.error)throw received.error;
  const response=received.response;
  Object.assign(record,{httpStatus:response.status(),path:new URL(response.url()).pathname,contentType:response.headers()['content-type']??null,headerSha256:response.headers()['x-artifact-sha256']??null});
  if(!response.ok()) {
   record.refusal=await response.text();
   throw Error(`Working-copy ${format} returned HTTP ${response.status()}`);
  }
  const download=await within(downloadPromise,15000);
  fs.mkdirSync(downloads,{recursive:true,mode:0o700});
  const file=path.join(downloads,`lmn-301-working-copy.${format}`);
  await download.saveAs(file);
  fs.chmodSync(file,0o600);
  const bytes=fs.readFileSync(file);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const expectedMagic=format==='docx'?'504b0304':'255044462d';
  const magic=bytes.subarray(0,format==='docx'?4:5).toString('hex');
  Object.assign(record,{downloaded:true,suggestedFilename:download.suggestedFilename(),file,bytes:bytes.length,sha256,magic,magicValid:magic===expectedMagic,hashMatchesHeader:sha256===record.headerSha256});
  requireCheck(record.magicValid&&record.hashMatchesHeader,'Download magic or delivered-byte hash differs');
  record.inspection=format==='docx'?inspectWord(bytes):await inspectPdf(bytes);
  requireCheck(record.inspection.draft&&record.inspection.uncontrolled,'Downloaded file lacks the draft/uncontrolled notice');
  requireCheck(format!=='docx'||record.inspection.documentXml,'Downloaded DOCX has no word/document.xml');
 }catch(error){record.error=error.message;measurements.failures.push({stage:`working-copy-${format}`,message:error.message});}
 finally{if(onDownload)page.off('download',onDownload);}
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}); page.setDefaultTimeout(120000);
 const errors=[],failed=[],failedRequests=[],steps=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,300)));
 page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/'))failed.push({path:new URL(r.url()).pathname,status:r.status()})});
 page.on('requestfailed',request=>{const failure=classifyRequestFailure(request);if(failure.path.startsWith('/api/'))failedRequests.push(failure);});
 async function step(name,shot){steps.push({name,url:page.url(),text:(await page.locator('main').innerText()).slice(0,18000)});console.info(name);if(shot)await page.screenshot({path:out+'/'+shot});}
 try{
 await page.goto((process.argv[2]||'http://127.0.0.1:5000')+'/concept2cure/login',{waitUntil:'domcontentloaded',timeout:120000});
 const chooser=page.getByRole('combobox',{name:'Demo person'});await chooser.waitFor();
 const value=await chooser.locator('option').evaluateAll(items=>items.find(x=>x.textContent.includes('Lumen Reviewer'))?.value);
 if(!value)throw Error('Reviewer option missing');await chooser.selectOption(value);await page.getByRole('button',{name:/demo access/i}).click();
 await page.waitForURL(url=>!url.pathname.includes('/login'));
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 const project=page.locator('.pj-index button.pj-card,.pj-index button.ct-row').filter({hasText:'LMN-301'});await project.waitFor();
 await step('projects','reviewer-projects-1440.png');await project.click();
 await page.locator('nav[aria-label="Project lifecycle"]').getByRole('button',{name:'Author',exact:true}).click();
 const doc=page.locator('[data-testid="pj-documents"] [data-testid="pj-doc-row"]').filter({hasText:'LMN-301 Phase 2a Viral Challenge Clinical Study Report'});
 await doc.locator('button[aria-label^="Open "]').waitFor();await step('project-author','reviewer-project-author-1440.png');
 const documentReads=Promise.all([
  page.waitForResponse(response=>response.request().method()==='GET'&&/^\/api\/authoring\/docs\/[^/]+\/sections$/.test(new URL(response.url()).pathname)),
  page.waitForResponse(response=>response.request().method()==='GET'&&/^\/api\/authoring\/docs\/[^/]+$/.test(new URL(response.url()).pathname)),
 ]).then(responses=>({responses}),error=>({error}));
 await doc.locator('button[aria-label^="Open "]').click();
 await page.locator('[data-testid="ed-tasks-open"]').waitFor();
 const reads=await documentReads;
 if(reads.error)throw reads.error;
 await measureSections(...reads.responses);
 await step('csr-editor','reviewer-csr-editor-1440.png');
 for(const [code,title,file] of [['11.4.1','Analysis of Efficacy','reviewer-efficacy-1440.png'],['12.2.2','Display of Adverse Events','reviewer-adverse-events-1440.png']]) {
 const section=page.locator('aside[aria-label=Outline] .ed-vol button.ed-tree-row').filter({has:page.locator('.ed-num').getByText(code,{exact:true})});
 await section.click();await page.locator('h1.ed-mast-t').getByText(title,{exact:true}).waitFor();await step(code,file);
 }
 for(const format of ['docx','pdf'])await measureWorkingCopy(page,format);
 await step('working-copies','reviewer-working-copies-1440.png');
 await page.locator('[data-testid="ed-tasks-open"]').click();
 await page.getByRole('button',{name:'Open the Review board',exact:true}).click();
 const row=page.locator('.split-list button.lrow').filter({hasText:'LMN-301 Phase 2a Viral Challenge Clinical Study Report'});await row.waitFor();await row.click();
 await page.getByRole('button',{name:'Record review decision',exact:true}).click();
 // Selecting the option reveals scientific preview; do not submit Record approval.
 const dialog=page.getByRole('dialog',{name:'Record review decision'});await dialog.locator('#rv-decision').selectOption('approved');
 const scientific=dialog.locator('section[aria-label="CSR scientific review"]');
 await scientific.getByRole('checkbox',{name:/Study data frozen for this document/}).check();
 const previewResponse=page.waitForResponse(r=>r.request().method()==='POST'&&/csr-evidence\/preview$/.test(new URL(r.url()).pathname));
 await scientific.getByRole('button',{name:'Read the retained tables',exact:true}).click();
 const response=await previewResponse;
 requireCheck(response.ok(),'Scientific evidence preview did not succeed');
 await scientific.getByText('2. Each figure in the saved text',{exact:true}).waitFor();
 steps.push({name:'scientific-preview',status:response.status(),body:await response.json()});
 await step('review-preview','reviewer-scientific-preview-1440.png');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Collapse',exact:true}).click();steps.push({name:'mobile',viewport:390,bodyWidth:await page.evaluate(()=>document.documentElement.scrollWidth),dialogWidth:await dialog.evaluate(el=>Math.round(el.getBoundingClientRect().width))});await page.screenshot({path:out+'/reviewer-scientific-preview-390.png'});
 console.info('scientific preview completed');
 }catch(e){steps.push({name:'failure',message:e.message,url:page.url(),text:(await page.locator('body').innerText()).slice(0,20000),buttons:await page.getByRole('button').allTextContents()});await page.screenshot({path:out+'/browser-failure.png'});process.exitCode=1;}
 if(errors.length||failed.length||failedRequests.some(row=>row.classification==='transport-failure')||measurements.failures.length)process.exitCode=1;
 fs.writeFileSync(out+'/reviewer-current-walk.json',JSON.stringify({scope:'Existing synthetic CSR, uncontrolled working copies and scientific preview. No review decision, freeze, signature or filing submitted; no live generation initiated.',steps,errors,failed,failedRequests,measurements},null,2));await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
