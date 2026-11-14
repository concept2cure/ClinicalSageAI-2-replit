const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const state=process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth=JSON.parse(fs.readFileSync(state+'/collab-browser-private.json','utf8'));
const mode=process.env.C2C_BROWSER_EXPECT || 'green';
const base='http://127.0.0.1:5000';
const result={mode,scope:'Running app with real fictional-account initialization; directory/task writes controlled in browser; no messages or task writes forwarded.',cases:[],pageErrors:[]};
async function signedContext(browser, scenario) {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(({auth})=>{for(const s of [localStorage,sessionStorage]){s.setItem('trialsage_access_token',auth.accessToken);s.setItem('trialsage_refresh_token',auth.refreshToken || '');s.setItem('trialsage_token_expiry',new Date(Date.now()+3600000).toISOString());s.setItem('trialsage_user',JSON.stringify(auth.user));s.setItem('currentOrganizationId',String(auth.user.organizationId));s.setItem('currentOrganization',String(auth.user.organizationId));}},{auth});
 let held, count=0;
 const waiting=new Promise(resolve=>{held=resolve;});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());
  if(['http:','https:'].includes(u.protocol)&&u.origin!==base){await route.abort();return;}
  let data;
  if(u.pathname==='/api/task-management/assignees')data={data:[{id:101,name:'Fictional teammate'}]};
  else if(u.pathname==='/api/projects')data=[{id:41,name:'Fictional task project'}];
  else if(u.pathname==='/api/tasks/tasks'&&r.method()==='POST'){
   count+=1;
   if(scenario==='unknown'){await route.abort('connectionclosed');return;}
   held(route);await waiting;return;
  }else if(u.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())){
   await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Unrelated mutation blocked by browser check.'})});return;
  }
  if(data!==undefined){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return;}
  await route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>result.pageErrors.push({name:e.name,message:e.message.slice(0,120)}));
 await page.goto(base+'/concept2cure/home',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByText('Ana Author',{exact:true}).first().waitFor({state:'visible',timeout:45000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('c2c:open-collab',{detail:{mode:'task'}})));
 await page.getByRole('option',{name:'Fictional task project'}).waitFor({state:'attached'});
 await page.getByLabel('Project',{exact:true}).selectOption('41');
 await page.getByPlaceholder(/^e\.g\. Review/).fill('Fictional pending task');
 return {context,page,waiting,count:()=>count};
}
async function settleDialog(page){
 await page.locator('.cl-modal').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
}
async function unknownCase(browser){
 const x=await signedContext(browser,'unknown'),{page}=x;
 try{
  const create=page.getByRole('button',{name:'Create task',exact:true});await create.click();
  const alert=page.getByRole('alert');await alert.waitFor();
  const text=await alert.innerText();
  if(mode==='red'){
   if(!text.includes('Nothing was saved'))throw Error('Baseline false claim not reproduced');
   const failed=page.waitForEvent('requestfailed',r=>new URL(r.url()).pathname==='/api/tasks/tasks');await create.click();await failed;
   if(x.count()!==2)throw Error('Baseline duplicate request not reproduced');
  }else{
   if(!/unknown|could not be confirmed/i.test(text)||/Nothing was saved/.test(text))throw Error('Task uncertainty was misstated');
   if(!await create.isDisabled()||!await page.getByRole('button',{name:'Create & add another',exact:true}).isDisabled())throw Error('Unconfirmed task remains resubmittable');
   if(x.count()!==1)throw Error('Unconfirmed task repeated');
  }
  await settleDialog(page);
  await page.locator('.cl-modal').screenshot({path:state+'/intake-unknown-'+mode+'.png'});
  result.cases.push({scenario:'unknown-task',requestCount:x.count(),falseUnsentClaim:text.includes('Nothing was saved'),repeatBlocked:await create.isDisabled()});
 }finally{await x.context.close();}
}
async function closeCase(browser){
 const x=await signedContext(browser,'pending'),{page}=x;
 try{
  await page.getByRole('button',{name:'Create task',exact:true}).click();const route=await x.waiting;
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('c2c:open-collab',{detail:{mode:'collab'}})));
  await page.getByTitle('Fictional teammate',{exact:true}).click();
  await page.getByLabel('Message',{exact:true}).fill('New draft must survive the earlier task reply.');
  await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({success:true,data:{taskId:'synthetic-browser-task',assigneeId:101}})});
  await page.waitForFunction(()=>window.C2C?.list().some(t=>t.taskId==='synthetic-browser-task'));
  const visible=await page.getByRole('dialog').count();
  if(mode==='green'&&(visible!==1||await page.getByLabel('Message',{exact:true}).inputValue()!=='New draft must survive the earlier task reply.'))throw Error('Old response closed/reset new intake');
  if(mode==='red'&&visible!==0)throw Error('Baseline stale close not reproduced');
  if(visible)await settleDialog(page);
  await page.screenshot({path:state+'/intake-close-'+mode+'.png',fullPage:true});
  result.cases.push({scenario:'close-and-reopen',newDialogRetained:visible===1,originalTaskProjected:true,taskRequestCount:x.count()});
 }finally{await x.context.close();}
}
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{await unknownCase(b);await closeCase(b);result.status='passed';}catch(e){result.status='failed';result.error={name:e.name,message:e.message.slice(0,220)};process.exitCode=1;}finally{await b.close();fs.writeFileSync(state+'/intake-browser-'+mode+'.json',JSON.stringify(result,null,2)+'\n');console.info(JSON.stringify(result));}})();
