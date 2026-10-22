/* Isolated fail-first control. Mutates only an in-memory copy of the canonical
 * function, never the repository's production source or a concurrent owner. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../../..');
const sourcePath = 'server/services/vault/vault-search.ts';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const needle = 'scope.programIds.filter(id => p.allowedProgramIds!.includes(id))';
if (source.split(needle).length !== 2) throw new Error('The negative control must change exactly one canonical narrowing expression.');
const permitted = '11111111-1111-4111-8111-111111111111';
const privateProgram = '22222222-2222-4222-8222-222222222222';

async function evaluate(text) {
  const exported = {};
  const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = {
    exports: exported,
    require(name) {
      if (name === './vault-version-family.js') return { supersededSql: () => '(FALSE)' };
      if (name === '../document-data-disposition/eligibility.js') return { vaultDataEligibleSql: () => 'TRUE', vaultBinaryAvailableSql: () => 'TRUE', vaultDispositionChoiceSql: () => 'NULL' };
      if (name === '../c2c/current-program-access.js') return {
        getCurrentAccessibleProgramScope: async () => ({ actor: { userId: 12, role: 'viewer' }, programIds: [permitted] }),
        assertVerifiedProgramScope() {},
        async requireProgramScopeStillCurrent() {},
      };
      throw new Error(`Unexpected dependency in isolated query control: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context, { filename: sourcePath });
  const calls = [];
  await exported.searchVaultDocuments({ query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: /count\(\*\)/.test(sql) ? [{ total: 0 }] : [] };
  } }, { organizationId: 7, userId: 12, programId: null, q: 'stability', limit: 1, offset: 0, includeSuperseded: false, allowedProgramIds: [permitted, privateProgram] });
  if (calls.length !== 2 || calls.some(call => call.params[2].length !== 1 || call.params[2][0] !== permitted)) {
    throw new Error('A supplied private program widened a canonical current actor count or page.');
  }
  return { statements: calls.length, bindsOnlyCanonicalProgram: true };
}

(async () => {
  let negativeFailure;
  try { await evaluate(source.replace(needle, '[...p.allowedProgramIds]')); }
  catch (error) { negativeFailure = error.message; }
  if (negativeFailure !== 'A supplied private program widened a canonical current actor count or page.') throw new Error('The deliberate widening mutant was not caught by the intended control.');
  const positive = await evaluate(source);
  const result = { sourcePath, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), negative: { expectedFailure: negativeFailure }, positive, scope: 'isolated application binding control; does not qualify SQL-role RLS or deployment' };
  fs.writeFileSync(path.join(__dirname, 'queries-narrowing-selftest.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
