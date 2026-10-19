/** Read-only source audit for the catalog SQL-structure exceptions. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { stripComments } from '../../../../scripts/ci/lib/strip-comments.mjs';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const expectedCounts = {
  'server/services/vault/document-catalog-document.ts': 14,
  'server/services/vault/document-catalog.service.ts': 4,
  'server/services/vault/document-catalog-governance.service.ts': 3,
  'server/services/vault/document-catalog-search-query.ts': 7,
  'server/services/vault/document-catalog-admission.ts': 1,
  'server/services/vault/document-catalog-write-integrity.ts': 3,
};
const helperPaths = [
  'server/services/document-data-disposition/eligibility.ts',
  'server/services/document-data-disposition/recorded-lineage.ts',
  'server/services/vault/vault-version-family.ts',
  'server/services/document-data-disposition/program-lock.ts',
  'scripts/ci/check-sql-interpolation.mjs',
  'scripts/ci/lib/strip-comments.mjs',
];
const reasons = {
  "vaultDataEligibleSql('d')": ['canonical_predicate', 'Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.'],
  "vaultBinaryAvailableSql('d')": ['canonical_predicate', 'Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.'],
  "vaultDispositionChoiceSql('d')": ['canonical_predicate', 'Literal alias d passes eligibility.alias validation; matching(vault,d) uses fixed vault column names and the ordered disposition projection is constant SQL.'],
  "supersededSql('d')": ['canonical_predicate', 'supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.'],
  currentClause: ['finite_literal_clause', 'Empty text or fixed AND NOT plus supersededSql(d). currentOnly selects a finite SQL branch and is never copied into SQL text; every alias is literal d.'],
  textCol: ['finite_literal_projection', 'Only d.extracted_text or NULL::text AS extracted_text. includeText selects a fixed projection; its runtime value is not serialized into SQL.'],
  programClause: ['generated_bind_placeholder_clause', 'Starts empty; optional fixed program equality and ANY predicates use only locally generated $n from params.length. Program UUID and copied allowed-program array are pushed into the separate values array. With the present definitions, placeholders are only $3 and $4.'],
  programFilter: ['generated_bind_placeholder_clause', 'Starts empty; optional fixed program equality/ANY clauses use locally generated $3/$4, and currentOnly adds fixed supersededSql(d). All actual program IDs/arrays are values-array binds, never clause text.'],
  countAllowed: ['generated_bind_placeholder_clause', 'Only empty text or fixed ANY($3::uuid[]) SQL. countParams starts with two items; push of the copied allowed-program array returns 3. Array contents are sent separately as bound value 3.'],
  hitAllowed: ['generated_bind_placeholder_clause', 'Only empty text or fixed ANY($6::uuid[]) SQL. hitParams starts with five items; push of the copied allowed-program array returns 6. Array contents are bound separately.'],
  "opts.hold ? 'FOR SHARE OF ou, u, o' : ''": ['finite_literal_lock_clause', 'hold selects exactly FOR SHARE OF ou, u, o or empty text. No option, actor ID, organization ID or role string is copied into the statement. Actor and organization IDs remain $1/$2 binds.'],
};
function sourceRecord(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function queryCall(node) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'query' && node.arguments.length > 0;
}
function containingFunction(node) {
  let parent = node.parent;
  while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
  return parent?.name?.getText() ?? '<anonymous>';
}
function collectSites(sourceFile) {
  const sites = [];
  function visit(node) {
    if (queryCall(node) && ts.isTemplateExpression(node.arguments[0])) {
      const template = node.arguments[0];
      for (const span of template.templateSpans) {
        const expression = span.expression.getText(sourceFile);
        const classification = reasons[expression];
        if (!classification) throw new Error(`Unclassified interpolation: ${sourceFile.fileName}: ${expression}`);
        const position = sourceFile.getLineAndCharacterOfPosition(span.expression.getStart(sourceFile));
        sites.push({ line: position.line + 1, column: position.character + 1,
          function: containingFunction(node), expression, category: classification[0], reason: classification[1],
          boundValuesExpression: node.arguments[1]?.getText(sourceFile) ?? null });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sites;
}
function scanFile(relativePath, expected) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const stripped = stripComments(source);
  const queries = [...stripped.matchAll(/\.query\s*(?:<[^>]*>)?\(\s*`([^`]*)`/g)];
  const scannerCount = queries.reduce((count, match) => count + (match[1].match(/\$\{/g) ?? []).length, 0);
  const rawCalls = [...stripped.matchAll(/\bsql\.raw\(/g)].length;
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sites = collectSites(sourceFile);
  if (sourceFile.parseDiagnostics.length || scannerCount !== expected || sites.length !== expected || rawCalls !== 0) {
    throw new Error(`Scanner/parser/source mismatch in ${relativePath}: regex ${scannerCount}, AST ${sites.length}, expected ${expected}, sql.raw ${rawCalls}`);
  }
  return { ...sourceRecord(relativePath), scannerCount, astCount: sites.length, sqlRawCalls: rawCalls, sites };
}
const files = Object.entries(expectedCounts).map(([relativePath, expected]) => scanFile(relativePath, expected));
const report = { version: 1, scope: 'catalog-only counted SQL interpolations and their transitive fixed fragment providers',
  verdict: 'No runtime data value is interpolated into SQL text at the 32 reviewed sites.',
  countedSites: files.reduce((sum, file) => sum + file.scannerCount, 0), files,
  dependencies: helperPaths.map(sourceRecord),
  canonicalDependencyTrace: {
    disposition: 'vaultDataEligibleSql/vaultBinaryAvailableSql/vaultDispositionChoiceSql -> eligible or matching with literal kind vault -> alias(d). The vault arm does not execute recordedLineageEligibleSql; that imported dependency serves captured/upload paths only.',
    version: 'supersededSql(d) -> VALID_LINK(succ,d); these audited aliases are source-code literals. supersededSql itself does not validate arbitrary aliases, so this finding cannot authorize nonliteral future callers.',
    programLock: 'reserveCatalogWrite -> lockDocumentDispositionProgram supplies organization/program IDs as separate values binds; no returned fragment enters any counted interpolation.',
    suggestionUpdate: 'Governance UPDATE strings SUGGEST/SUGGEST_WITH_VECTOR contain only fixed columns and $1..$13. sql(true/false) selects one of those constants. keyData JSON, vector literal, actor, attribution and document hashes are all values-array binds. This variable-query path is outside the gate regex but was manually reviewed.',
  },
  limitations: ['The ratchet is a coarse count and does not inspect value semantics or caller provenance.',
    'The gate cannot generally see preassembled SQL variables or string concatenation; this audit reviewed local clause builders and governance fixed UPDATE selection but is not a repository-wide injection proof.',
    'Counts and findings apply only to the exact hashed sources and listed helper dependencies.',
    'Fixed alias/fragment safety does not prove authorization, RLS effectiveness, regulatory compliance or provider delivery.',
    'No app, gate, baseline, branch, index or remote state is modified by this audit.'],
};
fs.writeFileSync(path.join(folder, 'catalog-sql-interpolation-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.info(`Catalog SQL audit: ${report.countedSites} reviewed structural sites, scanner and TypeScript AST agree.`);
