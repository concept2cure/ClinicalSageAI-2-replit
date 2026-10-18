/* Read-only inventory using the SQL ratchet's exact direct-template counter.
 * This does not alter application code, gate implementation or baseline. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const { stripComments } = await import(pathToFileURL(path.join(root, 'scripts/ci/lib/strip-comments.mjs')).href);
const paths = [
  'server/services/vault/document-catalog-actor-captures.ts',
  'server/services/vault/retrieval-source-access.ts',
];
const dependencyPaths = [
  'server/services/document-data-disposition/eligibility.ts',
  'server/services/document-data-disposition/recorded-lineage.ts',
  'server/services/vault/vault-version-family.ts',
  'server/services/vault/document-catalog-actor-access.ts',
  'server/services/vault/document-catalog-actor-reads.ts',
  'server/services/ana/source-read-scope.ts',
  'server/services/ana/project-scope-admission.ts',
  'server/services/ana/source-context-admission.ts',
  'server/services/clinical-regulatory-evidence/source-read-access.ts',
  'server/services/c2c/current-program-access.ts',
  'server/services/c2c/program-project-anchor.ts',
  'server/services/report-os/project-access.ts',
  'server/services/project-sharing-access.ts',
  'server/services/tenant/governed-tenant-context.ts',
  'server/db/tenantStore.ts',
  'server/db/sessionScope.ts',
  'server/db/rlsEnforcement.ts',
  'scripts/ci/check-sql-interpolation.mjs',
  'scripts/ci/lib/strip-comments.mjs',
];
const digest = relative => {
  const bytes = fs.readFileSync(path.join(root, relative));
  return { path: relative, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const lineAt = (source, at) => source.slice(0, at).split('\n').length;
const files = paths.map(relative => {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const stripped = stripComments(source);
  const statements = [];
  for (const match of stripped.matchAll(/\.query\s*(?:<[^>]*>)?\(\s*`([^`]*)`/g)) {
    const templateStart = match.index + match[0].indexOf('`') + 1;
    const expressions = [...match[1].matchAll(/\$\{([^}]*)\}/g)].map(expression => ({
      line: lineAt(source, templateStart + expression.index),
      expression: expression[1],
    }));
    statements.push({ queryLine: lineAt(source, match.index), expressions });
  }
  const rawCalls = (stripped.match(/\bsql\.raw\(/g) || []).length;
  return { ...digest(relative), directQueryTemplates: statements, sqlRawCalls: rawCalls,
    exactGateCount: statements.reduce((sum, statement) => sum + statement.expressions.length, 0) + rawCalls };
});
if (files[0].exactGateCount !== 8 || files[1].exactGateCount !== 2 || files.some(file => file.sqlRawCalls !== 0)) {
  throw new Error('Audited SQL sites changed; inspect the new expressions rather than applying this review automatically.');
}
const result = { files, dependencies: dependencyPaths.map(digest),
  classification: 'Reviewed fixed column/alias/join/guard fragments; runtime identities and limits are bind parameters. See QUERY_SQL_FRAGMENT_AUDIT.md for call-chain reasoning and limits.',
  policyActionPerformed: 'none; no application/gate/baseline modification',
};
fs.writeFileSync(path.join(directory, 'query-sql-fragment-audit.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
