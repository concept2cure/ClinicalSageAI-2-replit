#!/usr/bin/env node
/** Executes the actual candidate core/adapter with deterministic external-service test doubles.
 * No PostgreSQL, repository-wide typecheck, model, browser or live-tenant pass is implied.
 */
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root=dirname(fileURLToPath(import.meta.url));
const repository=join(root,'../../..');
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript');}
catch{ts=require(join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const out=mkdtempSync(join(tmpdir(),'c2c-csr-evidence-'));
try{
 writeFileSync(join(out,'package.json'),'{"type":"module"}\n');
 for(const name of ['csr-scientific-review-core','csr-scientific-review']){
  const input=readFileSync(join(repository,'server/services/authoring',name+'.ts'),'utf8');
  const result=ts.transpileModule(input,{fileName:name+'.ts',reportDiagnostics:true,
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
  writeFileSync(join(out,name+'.js'),result.outputText);
 }
 const result=spawnSync(process.execPath,['--test',join(root,'scientific-review.test.mjs')],
  {encoding:'utf8',env:{...process.env,CSR_REVIEW_TEST_BUILD:out}});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);
 process.exitCode=result.status??1;
}finally{rmSync(out,{recursive:true,force:true});}
