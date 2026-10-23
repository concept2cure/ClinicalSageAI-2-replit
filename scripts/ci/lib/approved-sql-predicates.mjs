import ts from 'typescript';

// This is a caller-scoped syntax proof, not a general allowance for SQL helpers.
// The builders retain the actual eligibility/supersession policy in one place.
const VAULT_BUILDERS = new Map([
  ['vaultDataEligibleSql', '../document-data-disposition/eligibility.js'],
  ['vaultBinaryAvailableSql', '../document-data-disposition/eligibility.js'],
  ['supersededSql', '../vault/vault-version-family.js'],
]);
const ARTIFACT_BUILDERS = new Map([
  ['artifactDataEligibleSql', './document-data-disposition/eligibility'],
]);
const REPORT_VAULT_BINARY_BUILDERS = new Map([
  ['vaultBinaryAvailableSql', '../document-data-disposition/eligibility'],
]);
const ESTAR_VAULT_BINARY_BUILDERS = new Map([
  ['vaultBinaryAvailableSql', '../../document-data-disposition/eligibility'],
]);
// The Vault's one metadata predicate (VR-18, 2026-10-22): fixed fragments with a
// literal alias, shared by the search and the tree so a filtered total and the
// tree's counts cannot disagree. No value reaches them; filter values are bound.
const VAULT_FILTER_FROM_ROUTES = new Map([
  ['vaultLifecycleStageSql', '../../services/vault/vault-document-filter.js'],
  ['vaultUnfiledSql', '../../services/vault/vault-document-filter.js'],
  ['vaultSuggestedSql', '../../services/vault/vault-document-filter.js'],
]);
const VAULT_FILTER_FROM_VAULT = new Map([
  ['vaultLifecycleStageSql', './vault-document-filter.js'],
]);
const CALLERS = new Map([
  ['server/routes/c2c/project-vault.ts', { alias: 'd', builders: VAULT_FILTER_FROM_ROUTES }],
  ['server/services/vault/vault-search.ts', { alias: 'd', builders: VAULT_FILTER_FROM_VAULT }],
  ['server/services/csr/vault-source-input.ts', { alias: 'd', builders: VAULT_BUILDERS }],
  ['server/services/csr/source-receipt-eligibility.ts', { alias: 'd', builders: VAULT_BUILDERS }],
  // A commitment's fulfilment evidence (P-41, 2026-10-19): the Vault version's
  // data eligibility and supersession, read through the canonical builders.
  ['server/services/ha-interactions/commitment-fulfilment.ts', { alias: 'd', builders: VAULT_BUILDERS }],
  ['server/services/figureGenerationService.ts', { alias: 'a', builders: ARTIFACT_BUILDERS }],
  ['server/services/autoExtractionPipeline.ts', { alias: 'a', builders: ARTIFACT_BUILDERS }],
  ['server/services/keywordExtractionService.ts', { alias: 'a', builders: ARTIFACT_BUILDERS }],
  ['server/services/report-os/report-package-legal.ts', { alias: 'd', builders: REPORT_VAULT_BINARY_BUILDERS }],
  ['server/services/pathway-engines/estar/estar-attachment-source-access.ts', { alias: 'd', builders: ESTAR_VAULT_BINARY_BUILDERS }],
]);

function canonicalBindings(sourceFile, checker, builders) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const specifier of clause.namedBindings.elements) {
      const name = specifier.name.text;
      if (specifier.isTypeOnly || specifier.propertyName || builders.get(name) !== statement.moduleSpecifier.text) continue;
      const symbol = checker.getSymbolAtLocation(specifier.name);
      // Ambiguous/merged declarations cannot establish the exact imported value.
      if (symbol?.declarations?.length === 1 && symbol.declarations[0] === specifier) bindings.set(name, symbol);
    }
  }
  return bindings;
}

function directQueryTemplate(node) {
  return ts.isTemplateExpression(node) && ts.isCallExpression(node.parent)
    && node.parent.arguments[0] === node && ts.isPropertyAccessExpression(node.parent.expression)
    && node.parent.expression.name.text === 'query';
}

function provedBuilder(expression, sourceFile, checker, bindings, alias) {
  if (!ts.isCallExpression(expression) || expression.questionDotToken || expression.typeArguments?.length
    || !ts.isIdentifier(expression.expression) || expression.arguments.length !== 1) return null;
  const name = expression.expression.text;
  const argument = expression.arguments[0];
  const binding = bindings.get(name);
  return binding && checker.getSymbolAtLocation(expression.expression) === binding
    && ts.isStringLiteral(argument) && ["'" + alias + "'", '"' + alias + '"'].includes(argument.getText(sourceFile)) ? name : null;
}

/**
 * Prove a fixed canonical predicate only when the legacy regex actually counted
 * its interpolation. Parse only exact reviewed callers with their own builder/import/alias contract. Unrecognized syntax,
 * imports, bindings, arguments and parser errors receive no subtraction.
 *
 * @returns {{ openingOffset: number, expressionStart: number, expressionEnd: number,
 *   builder: string, module: string, alias: string, line: number, column: number }[]}
 */
export function approvedSqlPredicates(relativePath, source, countedInterpolationOffsets) {
  const policy = CALLERS.get(relativePath);
  if (!policy || !countedInterpolationOffsets.length) return [];
  const { alias, builders } = policy;
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length) return [];
  // No dependency resolution or filesystem access: the checker is needed only
  // to distinguish this import binding from a same-named local/parameter.
  const options = { noResolve: true, noLib: true, target: ts.ScriptTarget.Latest };
  const host = {
    getSourceFile: fileName => fileName === relativePath ? sourceFile : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: fileName => fileName === relativePath,
    readFile: fileName => fileName === relativePath ? source : undefined,
    getCanonicalFileName: fileName => fileName, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const checker = ts.createProgram([relativePath], options, host).getTypeChecker();
  const bindings = canonicalBindings(sourceFile, checker, builders);
  const counted = new Set(countedInterpolationOffsets);
  const proofs = new Map();
  const visit = node => {
    if (directQueryTemplate(node)) {
      let openingOffset = node.head.end - 2;
      for (const span of node.templateSpans) {
        const expression = span.expression;
        if (counted.has(openingOffset)) {
          const name = provedBuilder(expression, sourceFile, checker, bindings, alias);
          if (name) {
            const position = sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile));
            proofs.set(openingOffset, { openingOffset, expressionStart: expression.getStart(sourceFile),
              expressionEnd: expression.end, builder: name, module: builders.get(name), alias,
              line: position.line + 1, column: position.character + 1 });
          }
        }
        openingOffset = span.literal.end - 2;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...proofs.values()];
}
