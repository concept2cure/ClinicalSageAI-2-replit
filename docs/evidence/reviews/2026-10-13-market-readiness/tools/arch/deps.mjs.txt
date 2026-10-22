import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const ROOT='<repo>';
const OUT=path.dirname(new URL(import.meta.url).pathname);
const pkg=JSON.parse(fs.readFileSync(ROOT+'/package.json','utf8'));
const files=execSync('git ls-files',{cwd:ROOT,maxBuffer:1e9}).toString().split('\n').filter(f=>/\.(m?[jt]sx?|cjs|mts|css|html)$/.test(f)&&!f.startsWith('docs/')&&!f.includes('node_modules'));
const reachS=new Set(fs.readFileSync(OUT+'/reach-server.txt','utf8').split('\n'));
const reachC=new Set(fs.readFileSync(OUT+'/reach-client.txt','utf8').split('\n'));
const scriptsText=JSON.stringify(pkg.scripts)+fs.readFileSync(ROOT+'/Dockerfile.optimized','utf8')+(fs.existsSync(ROOT+'/Makefile')?fs.readFileSync(ROOT+'/Makefile','utf8'):'')+execSync('cat .github/workflows/*.yml .husky/* 2>/dev/null || true',{cwd:ROOT,shell:'/bin/bash'}).toString();
const all={...pkg.dependencies,...pkg.devDependencies};
const use={};for(const d of Object.keys(all))use[d]={files:0,reach:0,test:0,cfg:0};
const esc=s=>s.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
const res=Object.keys(all).map(d=>[d,new RegExp(`(from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+|@import\\s+|url\\()['"\`]${esc(d)}(/[^'"\`]*)?['"\`]`)]);
for(const f of files){let s;try{s=fs.readFileSync(ROOT+'/'+f,'utf8')}catch{continue}
 const isTest=/(__tests__|\.test\.|\.spec\.|^tests\/|\/tests\/|e2e\/|\.stories\.)/.test(f);const isCfg=!f.includes('/')||f.startsWith('.storybook')||f.startsWith('.github');
 for(const [d,re] of res){if(re.test(s)){const u=use[d];u.files++;if(reachS.has(f)||reachC.has(f))u.reach++;else if(isTest)u.test++;if(isCfg)u.cfg++;}}}
const rows=[];for(const [d,u] of Object.entries(use)){const kind=pkg.dependencies[d]?'dep':'dev';const bin=new RegExp(`(^|[\\s"'/])${esc(d.replace(/^@[^/]+\//,''))}([\\s"':]|$)`).test(scriptsText);const types=d.startsWith('@types/');rows.push({d,kind,...u,bin,types});}
fs.writeFileSync(OUT+'/deps-usage.json',JSON.stringify(rows,null,1));
const unused=rows.filter(r=>r.files===0&&!r.bin&&!r.types);
const onlyNonProd=rows.filter(r=>r.kind==='dep'&&r.files>0&&r.reach===0&&!r.types);
console.log('total',rows.length,'deps',Object.keys(pkg.dependencies).length);
console.log('\nNO import anywhere & no CLI use ('+unused.length+'):',unused.map(r=>r.d+'('+r.kind+')').join(', '));
console.log('\nruntime deps imported but NOT on a reachable prod path ('+onlyNonProd.length+'):',onlyNonProd.map(r=>`${r.d}[f${r.files},t${r.test},cfg${r.cfg}]`).join(', '));
