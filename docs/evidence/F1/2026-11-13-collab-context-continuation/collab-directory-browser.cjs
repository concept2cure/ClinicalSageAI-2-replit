const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');const state=process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth=JSON.parse(fs.readFileSync(state+'/collab-browser-private.json','utf8'));
const base='http://127.0.0.1:5000';
const result={scope:'Running app client-session transition with synthetic account-B /session and directory responses; real local account A initial authentication. No message or task POST forwarded.',cases:[],pageErrors:[],writes:[]};
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});let phase='A';
 const userB={...auth.user,id:'900002',organizationId:'900002',displayName:'Scope B Author',firstName:'Scope',lastName:'B',email:'scope-b@example.test'};
 const expires=Date.now()+3600000;
 const bToken=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:userB.id,organizationId:userB.organizationId,exp:Math.floor(expires/1000)})).toString('base64url')+'.synthetic-client-fixture';
 await ctx.addInitScript(({auth})=>{for(const s of [localStorage,sessionStorage]){s.setItem('trialsage_access_token',auth.accessToken);s.setItem('trialsage_refresh_token',auth.refreshToken||'');s.setItem('trialsage_token_expiry',new Date(Date.now()+3600000).toISOString());s.setItem('trialsage_user',JSON.stringify(auth.user));s.setItem('currentOrganizationId',String(auth.user.organizationId));s.setItem('currentOrganization',String(auth.user.organizationId));}},{auth});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(['http:','https:'].includes(u.protocol)&&u.origin!==base){await route.abort();return;}
  let data;
  if(u.pathname==='/api/task-management/assignees')data={success:true,data:[{id:phase==='A'?'101':'202',name:'Scope '+phase+' teammate'}]};
  else if(u.pathname==='/api/projects')data=[{id:phase==='A'?101:202,name:'Scope '+phase+' project'}];
  else if(phase==='B'&&u.pathname==='/api/v1/auth/session')data={authenticated:true,user:userB,session:{expiresAt:new Date(expires).toISOString(),lifetimeHours:1}};
  else if(u.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method())){result.writes.push({path:u.pathname,method:req.method()});await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'No mutation allowed in this browser check.'})});return;}
  else if(phase==='B'&&u.pathname.startsWith('/api/'))data={success:true,data:[]};
  if(data!==undefined){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return;}await route.continue();
 });
 const page=await ctx.newPage();page.on('pageerror',e=>result.pageErrors.push({name:e.name,message:e.message.slice(0,140)}));
 await page.goto(base+'/concept2cure/home',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByText('Ana Author',{exact:true}).first().waitFor({state:'visible',timeout:45000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('c2c:open-collab',{detail:{mode:'collab'}})));
 await page.getByTitle('Scope A teammate',{exact:true}).waitFor({state:'visible',timeout:20000});
 await page.getByTitle('Scope A teammate',{exact:true}).click();
 await page.getByLabel('Message',{exact:true}).fill('Private account A draft — fictional browser fixture.');
 result.cases.push({stage:'account-A-directory',passed:true});
 await page.screenshot({path:state+'/collab-directory-A.png',fullPage:true});
 phase='B';
 const changed=await page.evaluate(async ({token,user})=>{const {authService}=await import('/src/services/portal/authService.tsx');const out=await authService.adoptSession(token,false,{userId:user.id,organizationId:user.organizationId});return String(out?.id)===user.id;},{token:bToken,user:userB});
 if(!changed)throw Error('Synthetic session adoption did not settle');
 await page.waitForFunction(()=>!document.body.innerText.includes('Scope A teammate'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('c2c:open-collab',{detail:{mode:'collab'}})));
 await page.getByTitle('Scope B teammate',{exact:true}).waitFor({state:'visible',timeout:20000});
 if(await page.getByTitle('Scope A teammate',{exact:true}).count())throw Error('Old recipient remained');
 if(await page.getByLabel('Message',{exact:true}).inputValue()!=='')throw Error('Old account message draft remained');
 result.cases.push({stage:'account-B-directory',passed:true,oldRecipientVisible:false,previousDraftVisible:false});
 await page.locator('.cl-modal').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 await page.screenshot({path:state+'/collab-directory-B.png',fullPage:true});
 await page.locator('.cl-modal').screenshot({path:state+'/collab-directory-B-dialog.png'});
 if(result.writes.some(x=>['/api/tasks/messages','/api/tasks/tasks'].includes(x.path)))throw Error('Unexpected message/task submission');
 result.status='passed';
}catch(e){result.status='failed';result.error={name:e.name,message:e.message.slice(0,230)};process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(state+'/collab-directory-browser.json',JSON.stringify(result,null,2)+'\n');console.info(JSON.stringify(result));}
})();
