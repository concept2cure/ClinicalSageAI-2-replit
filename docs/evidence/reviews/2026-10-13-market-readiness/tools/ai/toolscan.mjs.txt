import fs from 'node:fs';
const root='<repo>/server/services/ana/AnaToolExecutor.ts';
const src=fs.readFileSync(root,'utf8'); const lines=src.split('\n');
const starts=[]; lines.forEach((l,i)=>{const m=l.match(/^registerToolHandler\('([a-z0-9_]+)'/); if(m) starts.push([i,m[1]]);});
let noOrg=0, sqlNoOrg=[];
for (let k=0;k<starts.length;k++){ const [i,name]=starts[k]; const end=k+1<starts.length?starts[k+1][0]:lines.length; const body=lines.slice(i,end).join('\n');
  const hasSql=/\b(SELECT|UPDATE|INSERT|DELETE)\b[\s\S]{0,200}\b(FROM|INTO|SET)\b/.test(body) || /\.query\(|db\.(select|update|insert|delete)\(/.test(body);
  const hasOrg=/organizationId|organization_id|orgId|ctx\.org|tenant/.test(body);
  if (hasSql && !hasOrg) sqlNoOrg.push(name+':'+(i+1));
}
console.log('handlers in AnaToolExecutor', starts.length, 'with direct SQL and no org reference:', sqlNoOrg.length); console.log(sqlNoOrg.join(' '));
