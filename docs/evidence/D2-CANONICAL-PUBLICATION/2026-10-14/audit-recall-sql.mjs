/** Read-only SQL-text interpolation inventory; does not modify gate/baseline/app. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { stripComments } from '../../../../scripts/ci/lib/strip-comments.mjs';
const evidence=dirname(fileURLToPath(import.meta.url));
const repo=resolve(evidence,'../../../..');
const paths=['server/services/advancedRAGPipeline.ts','server/services/clinical-regulatory-evidence/data-room-search.ts','server/services/vault/document-passage-search.ts'];
const dependencies=['server/services/rag-filters.ts','server/services/vault/vault-version-family.ts','server/services/document-data-disposition/eligibility.ts','server/services/document-data-disposition/recorded-lineage.ts','server/services/clinical-regulatory-evidence/data-room-processing-state.ts','server/services/clinical-regulatory-evidence/evidence-spine.service.ts','scripts/ci/check-sql-interpolation.mjs','scripts/ci/lib/strip-comments.mjs','scripts/ci/sql-interpolation-baseline.json'];
const sha256=text=>createHash('sha256').update(text).digest('hex');
const texts={};for(const p of [...paths,...dependencies])texts[p]=await readFile(resolve(repo,p),'utf8');
const baseline=JSON.parse(texts['scripts/ci/sql-interpolation-baseline.json']);
const baseRef=execFileSync('git',['rev-parse','origin/concept2cure-v2'],{cwd:repo,encoding:'utf8'}).trim();
const baseTexts={};for(const p of paths)baseTexts[p]=execFileSync('git',['show',baseRef+':'+p],{cwd:repo,encoding:'utf8'});
const QUERY_TEMPLATE=/\.query\s*(?:<[^>]*>)?\(\s*`([^`]*)`/g;
function inspect(path,text){
 const tree=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const countedPositions=[];const rawCalls=[];const commentsRemoved=stripComments(text);
 for(const m of commentsRemoved.matchAll(QUERY_TEMPLATE)){
   const start=m.index+m[0].indexOf('`')+1;
   for(const marker of m[1].matchAll(/\$\{/g))countedPositions.push(start+marker.index);
 }
 for(const m of commentsRemoved.matchAll(/\bsql\.raw\(/g))rawCalls.push({line:tree.getLineAndCharacterOfPosition(m.index).line+1,offset:m.index});
 const sites=[];
 function containerFor(node){
  for(let current=node;current;current=current.parent){
    if((ts.isMethodDeclaration(current)||ts.isFunctionDeclaration(current))&&current.name)return current.name.getText(tree);
  }
  return 'top-level';
 }
 function spans(node,parentQueryLine,parentQuerySql,container){
  if(!ts.isTemplateExpression(node))return;
  for(const span of node.templateSpans){
   const expr=span.expression;const pos=text.lastIndexOf('${',expr.getStart(tree));
   sites.push({line:tree.getLineAndCharacterOfPosition(pos).line+1,offset:pos,expression:expr.getText(tree),container,queryLine:parentQueryLine,gateCounted:countedPositions.includes(pos),queryOpening:parentQuerySql.slice(0,90).replace(/\s+/g,' ')});
   // Nested query SQL snippets are deliberately audited beyond the regex's closing-backtick approximation.
   function nested(x){if(ts.isTemplateExpression(x))spans(x,parentQueryLine,parentQuerySql,container);else ts.forEachChild(x,nested);}
   ts.forEachChild(expr,nested);
  }
 }
 function visit(node){
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='query'&&node.arguments[0]&&ts.isTemplateExpression(node.arguments[0])){
   const arg=node.arguments[0];spans(arg,tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,arg.getText(tree),containerFor(node));
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
 const uncovered=countedPositions.filter(pos=>!sites.some(s=>s.offset===pos));
 return {gateCount:countedPositions.length+rawCalls.length,allActualQueryTemplateExpressionCount:sites.length,sqlRawCalls:rawCalls,unmappedGatePositions:uncovered,sites};
}
function canonicalFragmentReason(expr){
 if(/^(?:vault|rag|atom)(?:DataEligibleSql|OriginalFileAvailableSql|BinaryAvailableSql)\('[a-z_]+'\)$/.test(expr)||/^captured(?:DataEligibleSql|BinaryAvailableSql|DispositionChoiceSql)\('s'\)$/.test(expr))return {kind:'canonical_fixed_sql',reason:'Canonical disposition/availability fragment receives a literal alias; helper validates identifier grammar and emits fixed identifiers/operators/literal choices. Row/source data is compared in SQL, never emitted as SQL text.'};
 if(expr==="supersededSql('d')")return {kind:'canonical_fixed_sql',reason:'Canonical valid version-successor predicate receives fixed literal d; internal succ alias, table and link columns are code constants. This helper has no alias validation, so caller-literal trust is necessary and verified at every audited call.'};
 if(expr==='SOURCE_TEXT_AVAILABLE_SQL')return {kind:'canonical_fixed_sql',reason:"persistedTextAvailableSql('s') receives literal validated alias; fixed extracted_text column and ECMAScript whitespace literal form a read flag. No source text goes into emitted SQL."};
 if(expr==='SEARCH_VECTOR')return {kind:'canonical_fixed_sql',reason:'Literal vault.document_search_vector(s.title,NULL::text,left(s.extracted_text,900000)); fixed identifiers and constant prefix bound.'};
 if(expr==='allowed')return {kind:'canonical_fixed_sql',reason:"Literal AND d.program_id = ANY($3::uuid[]) is fixed SQL. Allowed programme UUIDs are parameter 3 in params, never joined/quoted into SQL."};
 return undefined;
}
function parameterFragmentReason(expr){
 if(['filter','denseFilter','lexFilter'].includes(expr))return {kind:'bound_filter_fragment',reason:'buildDocFilterClause receives code-constant VAULT_FILTER_COLUMNS/RAG_FILTER_COLUMNS; every query-derived value, programme UUID and UUID list is pushed onto the supplied parameter array. Interpolation contains fixed column names/operators plus generated $n placeholders.'};
 if(expr==='identity')return {kind:'bound_placeholder_fragment',reason:'Exact source hash goes to params.push(doc.contentHash), which returns only the next numeric parameter index; identity text is fixed AND d.content_hash = $n. No hash bytes enter SQL text.'};
 if(['orgFilter','lexOrgFilter','categoryClause'].includes(expr))return {kind:'bound_placeholder_fragment',reason:'Optional predicate appends its organization/category value to the query parameter array; only a constant column and generated numeric placeholder are emitted.'};
 if(expr==='profileClause')return {kind:'fixed_sql_branch',reason:'Branch is one of two fixed strings (empty or profile_id/project_profile_id = fixed placeholder). Profile value remains in parameter array.'};
 if(['thresholdIdx','params.length','page.length - 1','page.length'].includes(expr))return {kind:'placeholder_index',reason:'Code-selected/array-length integer appears after literal $; threshold/limit/offset values are separately bound. This is parameter numbering, not value text.'};
 if(expr==='embeddingCol'||expr==="embeddingCol.replace('c.embedding', 's.embedding')")return {kind:'fixed_identifier_branch',reason:'Boolean selects empty string or literal c.embedding::text AS embedding,; replacement is between the fixed c/s aliases, never a source value.'};
 if(expr.startsWith('withVectors ?')||expr.startsWith('args.keyless'))return {kind:'fixed_sql_branch',reason:'Boolean branch selects fixed SQL fragments (embedding projection/presence or constant full-text rank expression); query text remains $1.'};
 return undefined;
}
function dataRoomFragmentReason(expr){
 if(expr==='LIST_COLUMNS')return {kind:'fixed_identifier_list',reason:'Column names are an enumerated code-constant list; only literal s. prefix and join punctuation are added. No request-selected columns.'};
 if(expr==='where')return {kind:'bound_filter_fragment',reason:'visibleOrgClause called with literal placeholder index 1; replace prefixes only organization_id with fixed s.; filterClauses appends request data to args and emits only fixed columns/operators/SQL and numeric placeholder strings.'};
 if(expr==='qParam')return {kind:'placeholder_index',reason:'$n string is derived from numeric args.indexOf(p.q)+1; actual query string is already in bound args. It never incorporates query characters.'};
 if(expr.startsWith('qParam'))return {kind:'fixed_sql_branch_with_placeholder',reason:'Presence of generated qParam selects fixed snippet/rank SQL or NULL/empty; nested qParam is only a $n index and SEARCH_VECTOR is literal code SQL. Search text is in args.'};
 return undefined;
}
function reason(expr){
 return canonicalFragmentReason(expr) ?? parameterFragmentReason(expr) ?? dataRoomFragmentReason(expr) ??
   {kind:'REVIEW_REQUIRED',reason:'Unclassified expression requires explicit source review.'};
}
const files=[];
for(const p of paths){
 const now=inspect(p,texts[p]);const base=inspect(p,baseTexts[p]);const remaining=new Map();
 const key=s=>s.container+'\0'+s.expression;
 for(const s of base.sites.filter(x=>x.gateCounted))remaining.set(key(s),(remaining.get(key(s))||0)+1);
 now.sites=now.sites.map(s=>{const available=remaining.get(key(s))||0;const added=s.gateCounted&&available===0;if(s.gateCounted&&available>0)remaining.set(key(s),available-1);return {...s,...reason(s.expression),addedCountedExpressionComparedWithOrigin:added};});
 files.push({path:p,sha256:sha256(texts[p]),originSha256:sha256(baseTexts[p]),gateBaseline:baseline[p]??0,originGateCount:base.gateCount,...now});
}
const after={};for(const p of [...paths,...dependencies])after[p]=sha256(await readFile(resolve(repo,p),'utf8'));
const changed=Object.keys(texts).filter(p=>sha256(texts[p])!==after[p]);
const result={originRef:baseRef,scope:'Read-only exact three-file SQL text audit; no app/gate/baseline edits or model calls',sourcesUnchangedDuringAudit:changed.length===0,changedFiles:changed,dependencies:Object.fromEntries(dependencies.map(p=>[p,{sha256:sha256(texts[p])}])),files,limitations:['Gate regex ends at an inner backtick; nested snippet/rank suffix interpolations in data-room-search are separately inventoried by TypeScript parser.','Alias helper safety assumes only audited literal aliases are supplied; supersededSql itself does not validate arbitrary caller identifiers.','This is source review of SQL-text injection boundaries, not runtime tenant/project authorization, timing or PostgreSQL qualification.']};
await writeFile(resolve(evidence,'RECALL_SQL_INTERPOLATION_AUDIT.json'),JSON.stringify(result,null,2)+'\n');
if(changed.length||files.some(f=>f.unmappedGatePositions.length||f.sqlRawCalls.length||f.sites.some(s=>s.kind==='REVIEW_REQUIRED')))throw new Error('Audit snapshot changed or unclassified SQL sites remain');
console.info(JSON.stringify(files.map(f=>({path:f.path,gate:f.gateCount,baseline:f.gateBaseline,origin:f.originGateCount,actualSqlTemplateExpressions:f.allActualQueryTemplateExpressionCount,newCounted:f.sites.filter(s=>s.addedCountedExpressionComparedWithOrigin).length,sha256:f.sha256}))));
