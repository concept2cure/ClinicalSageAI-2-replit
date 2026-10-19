/** Prove mismatch control red on a generated copy; never mutate application files. */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const evidence=dirname(fileURLToPath(import.meta.url));
const repo=resolve(evidence,'../../../..');
const sourcePath=resolve(repo,'server/services/advancedRAGPipeline.ts');
const source=await readFile(sourcePath,'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const needle='    assertVaultSourceScope(read, source);';
if(source.split(needle).length!==2)throw new Error('Expected one immutable-scope identity checkpoint');
const variant=source.replace(needle,'    // Counterfactual: identity checkpoint intentionally omitted.').replace(
  /(from\s+['"]|import\(['"])(\.{1,2}\/[^'"]+)(['"])/g,
  (_all,start,spec,end)=>start+resolve(dirname(sourcePath),spec)+end,
);
const tmp=await mkdtemp(resolve(evidence,'.recall-counterfactual-'));
try{
  const copy=resolve(tmp,'pipeline.ts');await writeFile(copy,variant);
  const config=resolve(tmp,'config.mts');
  await writeFile(config,`import {defineConfig} from 'vitest/config';\nexport default defineConfig({root:${JSON.stringify(repo)},resolve:{alias:[{find:'../../../../server/services/advancedRAGPipeline.ts',replacement:${JSON.stringify(copy)}},{find:'shared',replacement:${JSON.stringify(resolve(repo,'shared'))}}]},test:{environment:'node',include:['docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/recall-rag-integration.test.mts'],pool:'forks',maxWorkers:1,fileParallelism:false,reporters:['verbose']}});\n`);
  const run=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),'run','--config',config,'--testNamePattern','refuses mismatched source actor'],{cwd:repo,encoding:'utf8',env:process.env});
  const output=(run.stdout??'')+(run.stderr??'');await writeFile(resolve(evidence,'recall-rag-counterfactual-red.txt'),output);
  const after=await readFile(sourcePath,'utf8');
  const expected=run.status===1&&output.includes('promise resolved')&&output.includes('refuses mismatched source actor');
  const result={control:'source actor identity mismatch before embedding',mutation:'omit assertVaultSourceScope only in generated shadow module',expectedRed:expected,exitCode:run.status,sourceSha256Before:hash(source),sourceSha256After:hash(after),sourceUnchanged:source===after,variantSha256:hash(variant),temporaryGeneratedCopyRemoved:true};
  await writeFile(resolve(evidence,'recall-rag-counterfactual-result.json'),JSON.stringify(result,null,2)+'\n');
  if(!expected||source!==after)throw new Error('Counterfactual did not prove the identity guard or app source changed');
  console.info(JSON.stringify(result));
}finally{await rm(tmp,{recursive:true,force:true});}
