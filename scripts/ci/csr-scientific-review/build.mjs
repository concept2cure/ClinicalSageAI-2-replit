/** Transpiles the repository's CSR scientific-review core, its adapter and the
 * rules they share with the review screen into a temporary directory, keeping
 * the repository layout so the adapter's relative imports resolve as they do
 * in the server. Nothing is substituted: these are the files that ship.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root=dirname(fileURLToPath(import.meta.url));
const repository=join(root,'../../..');
const FILES=['server/services/authoring/csr-scientific-review-core.ts','server/services/authoring/csr-scientific-review.ts',
 'shared/authoring/csr-scientific-review.ts','shared/canonical-json.ts'];

export function buildCandidate(){
 const require=createRequire(import.meta.url);
 let ts;
 try{ts=require('typescript');}
 catch{ts=require(join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
 const out=mkdtempSync(join(tmpdir(),'c2c-csr-evidence-'));
 const cleanup=()=>rmSync(out,{recursive:true,force:true});
 try{
  writeFileSync(join(out,'package.json'),'{"type":"module"}\n');
  for(const file of FILES){
   const result=ts.transpileModule(readFileSync(join(repository,file),'utf8'),{fileName:file,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}});
   const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
   if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
   const target=join(out,file.replace(/\.ts$/,'.js'));
   mkdirSync(dirname(target),{recursive:true});
   writeFileSync(target,result.outputText);
  }
 }catch(error){cleanup();throw error;}
 return {dir:join(out,'server/services/authoring'),cleanup};
}
