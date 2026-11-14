const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const state=process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth=JSON.parse(fs.readFileSync(state+'/collab-browser-private.json','utf8'));
const fixture=JSON.parse(fs.readFileSync(state+'/collab-browser-fixture.json','utf8'));
const out={scope:'Running canonical app with real fictional project/document/authentication; lock and presence responses are intercepted UI boundaries, not backend qualification.',cases:[],errors:[],requests:[]};
function verifyTakeoverRequest(sent, fixture, mode) {
 if(!sent||sent.body.sectionId!==fixture.sections[1].id)throw Error('Expected intercepted target2 request was not seen');
 const expectedReason=mode==='red'?'Jo asked me to finish section one.':'Ravi asked me to finish section two.';
 if(sent.body.reason!==expectedReason)throw Error('Wrong reason in intercepted request');
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({auth})=>{
   const expiry=JSON.parse(atob(auth.accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000;
   for(const s of [localStorage,sessionStorage]){
    s.setItem('trialsage_access_token',auth.accessToken);s.setItem('trialsage_refresh_token',auth.refreshToken||'');
    s.setItem('trialsage_token_expiry',new Date(expiry).toISOString());s.setItem('trialsage_user',JSON.stringify(auth.user));
    s.setItem('currentOrganizationId',String(auth.user.organizationId));s.setItem('currentOrganization',String(auth.user.organizationId));
   }
  },{auth});
  const lockRows=fixture.sections.map((s,i)=>({documentId:fixture.documentId,sectionId:s.id,mine:false,lockedByLabel:i?'Ravi Iyer':'Jo Park',reason:'Fictional browser boundary'}));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(['http:','https:'].includes(url.protocol)&&url.origin!==fixture.base){await route.abort();return;}
   if(url.pathname.startsWith('/api/realtime-collab/')){
    out.requests.push({method:req.method(),path:url.pathname,...(req.method()==='POST'&&url.pathname.endsWith('/locks')?{body:req.postDataJSON()}: {})});
    const data=url.pathname.includes('/locks')?{success:true,data:lockRows}:{success:true,data:{room:{connectedUsers:[]}},connectedUsers:[],roomKnown:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return;
   }
   if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method())){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Browser check does not perform this mutation.'})});return;}
   await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>out.errors.push({name:e.name,message:e.message.slice(0,180)}));
  await page.goto(fixture.base+'/concept2cure/document-authoring?program='+fixture.programId,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.ed').waitFor({state:'visible',timeout:60000});
  await page.getByText('Collaboration context verification — fictional',{exact:false}).first().waitFor({state:'visible',timeout:30000});
  out.cases.push({stage:'existing-editor-opened',passed:true});
  const one=page.locator('.ed-tree button').filter({hasText:fixture.sections[0].title}).first();
  const two=page.locator('.ed-tree button').filter({hasText:fixture.sections[1].title}).first();
  await one.waitFor({state:'visible',timeout:30000});await one.click();
  await page.getByText(/locked by Jo Park/).waitFor({state:'visible',timeout:15000});
  await page.getByRole('button',{name:'Take over the section lock',exact:true}).click();
  await page.getByRole('textbox',{name:'Reason for taking over the lock'}).fill('Jo asked me to finish section one.');
  await page.screenshot({path:state+'/collab-section-one-armed.png',fullPage:true});
  await two.click();await page.getByText(/locked by Ravi Iyer/).waitFor({state:'visible',timeout:15000});
  const confirm=page.getByRole('button',{name:'Confirm lock takeover',exact:true});
  const reason=page.getByRole('textbox',{name:'Reason for taking over the lock'});
  const carried=(await confirm.count())===1&&(await reason.count())===1&&await reason.inputValue()==='Jo asked me to finish section one.';
  const mode=process.env.C2C_BROWSER_EXPECT||'green';
  out.cases.push({stage:'section-switch',mode,carriedOldConfirmation:carried});
  await page.screenshot({path:state+'/collab-section-two-'+mode+'.png',fullPage:true});
  if(mode==='red'){
   if(!carried)throw Error('Expected baseline carryover was not reproduced');
   await confirm.click();
  }else{
   if(carried||(await confirm.count())!==0||(await reason.count())!==0)throw Error('Old takeover intent remained');
   await page.getByRole('button',{name:'Take over the section lock',exact:true}).click();
   if(await reason.inputValue()!==''||!await confirm.isDisabled())throw Error('New target did not require a fresh reason');
   await reason.fill('Ravi asked me to finish section two.');await confirm.click();
  }
  await page.waitForFunction(()=>true);
  const sent=out.requests.find(x=>x.method==='POST'&&x.path.endsWith('/locks'));
  verifyTakeoverRequest(sent, fixture, mode);
  out.cases.push({stage:'takeover-request-intercepted',passed:true,mode,sectionId:sent.body.sectionId,reasonBelongsTo:mode==='red'?'previous-section':'current-section'});

  const text=await page.locator('body').innerText();
  fs.writeFileSync(state+'/collab-browser-page-text.txt',text);
  await page.screenshot({path:state+'/collab-editor-initial.png',fullPage:true});
  out.url=page.url();
 }catch(e){out.failure={name:e.name,message:e.message.slice(0,220)};process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(state+'/collab-browser-'+(process.env.C2C_BROWSER_EXPECT||'green')+'.json',JSON.stringify(out,null,2)+'\n');console.info(JSON.stringify(out));}
})();
