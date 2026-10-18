import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
const root='<repo>';
const out = execFileSync('git',['grep','-nE','(gw|gateway|getGateway\\(\\))\\.(route|chat|routeStream)\\(|\\bai\\.(chat|complete|completeJSON)\\(|aiComplete\\(','--','server'],{cwd:root,encoding:'utf8'});
let total=0, missing=0; const ex=[];
for (const line of out.split('\n').filter(Boolean)) {
  const [file, ln] = line.split(':'); if (/__tests__|\.test\./.test(file) || file.startsWith('server/services/ai-gateway/') || file==='server/lib/unified-ai-client.ts') continue;
  const src = fs.readFileSync(root+'/'+file,'utf8').split('\n'); const i=Number(ln)-1;
  if (/^\s*(\/\/|\*)/.test(src[i])) continue;
  const win = src.slice(i, i+25).join('\n');
  total++; if (!/organizationId|orgId|organization_id|tenantId/.test(win)) { missing++; ex.push(file+':'+ln); }
}
console.log('call sites', total, 'without org in 25-line window', missing);
console.log(ex.slice(0,40).join('\n'));
