const fs=require('fs');
const files=process.argv.slice(2);
for (const f of files){
  const src=fs.readFileSync(f,'utf8');
  const re=/`([^`]*\bSELECT\b[^`]*\bFROM\b[^`]*)`/gis; let m;
  while((m=re.exec(src))){
    const q=m[1]; const line=src.slice(0,m.index).split('\n').length;
    if (/\bLIMIT\b/i.test(q)) continue;
    if (/\bcount\s*\(|\bEXISTS\s*\(|\bsum\s*\(|\bmax\s*\(|\bmin\s*\(/i.test(q) && !/\bFROM\b[\s\S]*\bFROM\b/i.test(q)) continue;
    if (/WHERE[\s\S]*\b(id|uuid|doc_id|document_id)\s*=\s*\$\d+\s*(AND|$|\)|\n)/i.test(q) && !/ORDER BY/i.test(q)) continue; // single-row by pk
    if (/INSERT|UPDATE|DELETE/i.test(q.split(/\bSELECT\b/i)[0])) continue;
    const tbl=(q.match(/FROM\s+([a-z_."]+)/i)||[])[1];
    console.log(`${f}:${line} FROM ${tbl} ${/ORDER BY/i.test(q)?'[ORDER BY, no LIMIT]':''}`);
  }
}
