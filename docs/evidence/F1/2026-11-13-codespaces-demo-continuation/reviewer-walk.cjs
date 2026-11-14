const { chromium }=require('playwright');
const fs=require('fs');
const out=__dirname;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}); page.setDefaultTimeout(120000);
 const errors=[],failed=[],steps=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,300)));
 page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/'))failed.push({path:new URL(r.url()).pathname,status:r.status()})});
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
 await doc.locator('button[aria-label^="Open "]').click();
 await page.locator('[data-testid="ed-tasks-open"]').waitFor();
 await step('csr-editor','reviewer-csr-editor-1440.png');
 for(const [code,title,file] of [['11.4.1','Analysis of Efficacy','reviewer-efficacy-1440.png'],['12.2.2','Display of Adverse Events','reviewer-adverse-events-1440.png']]) {
 const section=page.locator('aside[aria-label=Outline] .ed-vol button.ed-tree-row').filter({has:page.locator('.ed-num').getByText(code,{exact:true})});
 await section.click();await page.locator('h1.ed-mast-t').getByText(title,{exact:true}).waitFor();await step(code,file);
 }
 await page.locator('[data-testid="ed-tasks-open"]').click();
 await page.getByRole('button',{name:'Open the Review board',exact:true}).click();
 const row=page.locator('.split-list button.lrow').filter({hasText:'LMN-301 Phase 2a Viral Challenge Clinical Study Report'});await row.waitFor();await row.click();
 await page.getByRole('button',{name:'Record review decision',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Record review decision'});await dialog.locator('#rv-decision').selectOption('approved');
 const scientific=dialog.locator('section[aria-label="CSR scientific review"]');
 await scientific.getByRole('checkbox',{name:/Study data frozen for this document/}).check();
 const previewResponse=page.waitForResponse(r=>r.request().method()==='POST'&&/csr-evidence\/preview$/.test(new URL(r.url()).pathname));
 await scientific.getByRole('button',{name:'Read the retained tables',exact:true}).click();
 const response=await previewResponse;
 await scientific.getByText('2. Each figure in the saved text',{exact:true}).waitFor();
 steps.push({name:'scientific-preview',status:response.status(),body:await response.json()});
 await step('review-preview','reviewer-scientific-preview-1440.png');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Collapse',exact:true}).click();steps.push({name:'mobile',viewport:390,bodyWidth:await page.evaluate(()=>document.documentElement.scrollWidth),dialogWidth:await dialog.evaluate(el=>Math.round(el.getBoundingClientRect().width))});await page.screenshot({path:out+'/reviewer-scientific-preview-390.png'});
 console.info('scientific preview completed');
 }catch(e){steps.push({name:'failure',message:e.message,url:page.url(),text:(await page.locator('body').innerText()).slice(0,20000),buttons:await page.getByRole('button').allTextContents()});await page.screenshot({path:out+'/browser-failure.png'});process.exitCode=1;}
 fs.writeFileSync(out+'/reviewer-walk.json',JSON.stringify({steps,errors,failed},null,2));await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
