const fs=require('fs');
const S='/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const {chromium}=require(S+'/pwtest/node_modules/playwright');
const P='c2ed888d-2958-4332-b186-e81482f2ceec', BASE='http://127.0.0.1:5100', OUT=S+'/walk-1109-evidence/frame-after';
fs.mkdirSync(OUT,{recursive:true});
const SCREENS=[['projects','/concept2cure/projects'],['project',`/concept2cure/project-home?program=${P}`],['submission-center',`/concept2cure/submission-center?program=${P}`],['tasks',`/concept2cure/tasks?program=${P}`],['review',`/concept2cure/review?program=${P}`],['communication',`/concept2cure/communication-center?program=${P}`],['rbm',`/concept2cure/rbm?program=${P}`],['ind-lifecycle',`/concept2cure/ind-lifecycle?program=${P}`],['vault',`/concept2cure/vault?program=${P}`],['etmf',`/concept2cure/etmf?program=${P}`]];
const sizes=[{w:1440,h:900},{w:390,h:844,mobile:true}];
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',args:['--disable-gpu','--no-sandbox']});
const res={};
for(const sz of sizes){const ctx=await b.newContext({viewport:{width:sz.w,height:sz.h},deviceScaleFactor:1,isMobile:!!sz.mobile,hasTouch:!!sz.mobile,storageState:S+'/walk-1109-capture/work/state.json'});
 const page=await ctx.newPage();
 for(const [key,url] of SCREENS){
  try{await page.goto(BASE+url,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForSelector('.c2c-v2',{timeout:60000});await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});await page.waitForTimeout(2500);}catch(e){res[`${key}-${sz.w}`]={error:String(e).slice(0,200)};continue;}
  const m=await page.evaluate(()=>{const cs=e=>getComputedStyle(e);const vis=e=>{if(!e||!e.getClientRects().length)return false;const s=cs(e);return s.visibility!=='hidden'&&s.display!=='none';};
   const title=[...document.querySelectorAll('.ph-title, .reg-title, .surface-head h1, .pj-title, .page h1, .page h2')].find(vis);
   const root=[...document.querySelectorAll('.page-inner, .pj-index, .sp')].find(vis);
   const pg=document.querySelector('.page');const W=window.innerWidth;
   const clipped=el=>{let a=el.parentElement;while(a&&a!==document.body){const o=cs(a).overflowX;if(o!=='visible'){const ar=a.getBoundingClientRect();return el.getBoundingClientRect().right>ar.right+1?'inside-scroller':'ok';}a=a.parentElement;}return 'none';};
   const past=[];for(const el of document.querySelectorAll('.page *')){if(!vis(el))continue;const r=el.getBoundingClientRect();if(r.width<1)continue;if(r.right>W+1&&clipped(el)!=='inside-scroller'){past.push({tag:el.tagName,cls:(el.className||'').toString().slice(0,40),right:Math.round(r.right)});if(past.length>=5)break;}}
   const cards=[];for(const card of document.querySelectorAll('.page .pj-card, .page .card, .page .de, .page .pj-sec')){if(!vis(card))continue;const cr=card.getBoundingClientRect();for(const el of card.querySelectorAll('*')){if(!vis(el))continue;const r=el.getBoundingClientRect();if(r.width<1)continue;if(r.right>cr.right+1){let a=el.parentElement,inScroll=false;while(a&&a!==card){if(cs(a).overflowX!=='visible'){inScroll=true;break;}a=a.parentElement;}if(!inScroll){cards.push({card:(card.className||'').toString().slice(0,30),cls:(el.className||'').toString().slice(0,40),over:Math.round(r.right-cr.right)});if(cards.length>=5)break;}}}if(cards.length>=5)break;}
   const rbm=document.querySelector('.rbm-content');const ana=document.querySelector('.rbm-ana');
   return {title:title?{text:title.textContent.trim().slice(0,50),left:Math.round(title.getBoundingClientRect().left)}:null,
     root:root?{cls:(root.className||'').toString().slice(0,50),left:Math.round(root.getBoundingClientRect().left),width:Math.round(root.getBoundingClientRect().width),padL:cs(root).paddingLeft,maxW:cs(root).maxWidth}:null,
     page:pg?{scrollWidth:pg.scrollWidth,clientWidth:pg.clientWidth,sideways:pg.scrollWidth>pg.clientWidth}:null,
     docSideways:document.documentElement.scrollWidth>document.documentElement.clientWidth,
     pastViewport:past,pastCard:cards,
     rbm:rbm?{contentWidth:Math.round(rbm.getBoundingClientRect().width),anaOpen:!!ana&&vis(ana),anaWidth:ana?Math.round(ana.getBoundingClientRect().width):null}:null};});
  res[`${key}-${sz.w}`]=m;
  if(sz.w===1440)await page.screenshot({path:`${OUT}/${key}-1440-light.png`});
 }
 await ctx.close();}
fs.writeFileSync(OUT+'/frame-after.json',JSON.stringify(res,null,1));
for(const [k,v] of Object.entries(res)){console.log(k.padEnd(24), v.error?('ERR '+v.error):`title ${v.title?.left??'-'} (${(v.title?.text||'').slice(0,24)}) root ${v.root?.cls?.slice(0,22)} L${v.root?.left} W${v.root?.width} pad ${v.root?.padL} | sideways ${v.page?.sideways}/${v.docSideways} past ${v.pastViewport.length} card ${v.pastCard.length}${v.rbm?` | rbm content ${v.rbm.contentWidth} ana ${v.rbm.anaOpen}`:''}`);}
await b.close();})().catch(e=>{console.log('ERR',String(e).slice(0,600));process.exit(1)});
