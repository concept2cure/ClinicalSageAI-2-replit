#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,openSync,closeSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn,execFileSync } from 'node:child_process';
const folder=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(folder,'../../../..');
const label=process.argv[2]??'review';
if(!process.version.startsWith('v22.')||!/^[a-z0-9-]{1,40}$/.test(label)||process.argv.length>3)throw new Error('Use Node22 with a safe evidence label');
const config='docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/independent.config.mts';
const files=[...new Set(['server/services/clinical-regulatory-evidence/data-room-processing-store.ts','server/services/clinical-regulatory-evidence/data-room-processing-sweep.ts','server/services/clinical-regulatory-evidence/data-room-processing.ts','server/services/clinical-regulatory-evidence/data-room-processing-state.ts','shared/data-room-processing-status.ts','server/services/vault/document-catalog-actor-captures.ts','scripts/ci/sql-interpolation-baseline.json','scripts/ci/check-sql-interpolation.mjs','docs/architecture/DATA_ROOM_SQL_COMPOSITION_REVIEW_2026-10-14.md','docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/PUSH_GATE_RECONCILIATION_CONTRACT.md',
'server/services/vault/document-catalog-document.ts','server/services/vault/document-catalog-actor-reads.ts','server/services/vault/document-catalog-operation-types.ts','server/services/vault/document-catalog-source-scope.ts','server/services/vault/document-catalog-governance.service.ts','server/routes/ana-ri/stream.ts','server/routes/chat/send-message.ts','server/services/ana/AnaToolExecutor.ts','server/services/ana/step-presentation.ts',
'server/services/document-data-disposition/__tests__/confirmation-freshness.pglite.integration.test.ts',
  'server/services/document-data-disposition/__tests__/runtime-role.pglite.integration.test.ts','server/services/document-data-disposition/__tests__/route-auth.test.ts',
  'server/routes/c2c/document-data-dispositions.ts','server/routes/c2c/project-route-access.ts',
'server/services/ana/source-context-admission.ts','server/services/clinical-regulatory-evidence/source-read-access.ts',
  'server/services/c2c/current-program-access.ts','server/services/c2c/program-access.ts','server/services/c2c/program-project-anchor.ts',
  'server/services/csr/project-scope.ts','server/services/document-data-disposition/service.ts',
  'server/services/document-data-disposition/impact.ts','server/services/document-data-disposition/tokens.ts',
  'server/services/document-data-disposition/__tests__/disposition-fixture.ts',
'shared/ana/source-admission-receipts.ts','server/services/ana/read-receipts.ts',
  'server/services/ana/source-read-receipt.ts','server/services/ana/source-admission-receipt-store.ts','server/services/ana/source-admission-receipt-history.ts',
  'server/services/ana/source-read-scope.ts','server/services/ana/project-scope-admission.ts','server/services/vault/document-catalog-admission.ts',
  'server/services/vault/document-catalog.service.ts','server/services/vault/document-catalog-actor-access.ts',
  'server/services/tenant/tenant-offboarding.ts','server/services/tenant/tenant-source-read-receipt-purge.ts',
  'server/services/tenant-export/tenant-full-export.service.ts','server/services/tenant/tenant-purge-audit.ts',
  'server/services/tenant/governed-tenant-context.ts','server/services/document-data-disposition/program-lock.ts',
  'server/services/document-data-disposition/eligibility.ts','server/services/report-os/project-access.ts','server/services/project-sharing-access.ts',
  'server/db/sessionScope.ts','migrations/20261014_ana_source_read_receipts.sql',config,
  'docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/run-independent.mjs',
  ...readdirSync(folder).filter(f=>/^independent-.*\.test\.mts$/.test(f)).map(f=>path.relative(repo,path.join(folder,f)))])].sort();
const hash=v=>createHash('sha256').update(v).digest('hex');
const snapshot=()=>Object.fromEntries(files.map(f=>[f,hash(readFileSync(path.join(repo,f)))]));
const before=snapshot(),startedAt=new Date().toISOString(),log=path.join(folder,`independent-${label}.log`),fd=openSync(log,'w',0o600);
const command=['node_modules/vitest/vitest.mjs','run','--config',config];
const child=spawn(process.execPath,command,{cwd:repo,stdio:['ignore',fd,fd]});
const result=await new Promise(resolve=>{child.once('error',e=>resolve({exitCode:1,error:e.code??'RUNNER_ERROR'}));child.once('exit',(exitCode,signal)=>resolve({exitCode,signal}));});
closeSync(fd);const after=snapshot(),changedSources=files.filter(f=>before[f]!==after[f]);
const counts=readFileSync(log,'utf8').replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'),'').split('\n').find(l=>/^\s*Tests\s/.test(l))?.trim()??'No completed count';
const qualified=result.exitCode===0&&changedSources.length===0&&/^Tests\s+\d+ passed \(\d+\)$/.test(counts);
writeFileSync(path.join(folder,`independent-${label}-manifest.json`),JSON.stringify({runtime:process.version,baselineHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),command:['node',...command],startedAt,finishedAt:new Date().toISOString(),...result,counts,qualified,before,after,sourcesUnchangedDuringRun:changedSources.length===0,changedSources,logSha256:hash(readFileSync(log)),proofScope:'Actual strict DTO/fingerprint, selected default settlement, source verifier and ledger append with explicit controlled source/SQL seams; merged recorded-parent ancestry and persisted role/disposition reservation order in real PGlite. No actual PostgreSQL/provider/deployed/full-schema proof; PostgreSQL evidence is separate.'},null,2)+'\n');
process.stdout.write(JSON.stringify({counts,qualified,changedSources})+'\n');process.exitCode=qualified?0:result.exitCode===0?3:result.exitCode??1;
