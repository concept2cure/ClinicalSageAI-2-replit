/** Bounded proof of the canonical authoring seed and transaction call graph. */
import ts from 'typescript';

export const AUTHORING_TRANSACTION = Object.freeze({
  owner: 'server/services/authoring/authoring-documents.ts',
  seed: 'server/services/authoring/authoring-section-seed.ts',
  lifecycle: 'server/services/authoring/authoring-create-outcome.ts',
});

const id = (node, name) => Boolean(node && ts.isIdentifier(node) && node.text === name);
const call = (node, name) => Boolean(node && ts.isCallExpression(node) && id(node.expression, name));
const property = (node, object, name) => Boolean(node && ts.isPropertyAccessExpression(node) && id(node.expression, object) && node.name.text === name);
const awaited = node => node && ts.isAwaitExpression(node) ? node.expression : undefined;
const value = statement => ts.isExpressionStatement(statement) ? awaited(statement.expression)
  : ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1
    ? awaited(statement.declarationList.declarations[0].initializer) : undefined;
const statementCall = (statement, name, args) => {
  const expression = value(statement);
  return call(expression, name) && args.every((name, index) => id(expression.arguments[index], name));
};

function descendants(node, predicate) {
  const found = [];
  function visit(child) { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); }
  visit(node);
  return found;
}

function imported(source, name, module) {
  return source.statements.some(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === module
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(element => id(element.name, name)
      && (!element.propertyName || id(element.propertyName, name))));
}

function bodyFunction(source, name) {
  const functions = source.statements.filter(statement => ts.isFunctionDeclaration(statement) && id(statement.name, name));
  return functions.length === 1 && functions[0].body
    && functions[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? functions[0] : undefined;
}

function assignment(node, object, name, kind) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && property(node.left, object, name) && node.right.kind === kind;
}

function query(node, command) {
  return node && ts.isCallExpression(node) && property(node.expression, 'client', 'query')
    && (command === undefined || (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === command));
}

function begin(node) {
  if (!query(node) || node.arguments.length !== 1) return false;
  const argument = node.arguments[0];
  return (ts.isStringLiteral(argument) && argument.text === 'BEGIN')
    || (ts.isConditionalExpression(argument) && ts.isStringLiteral(argument.whenTrue)
      && argument.whenTrue.text === 'BEGIN ISOLATION LEVEL SERIALIZABLE'
      && ts.isStringLiteral(argument.whenFalse) && argument.whenFalse.text === 'BEGIN');
}

function lifecycleFindings(source) {
  const rollback = bodyFunction(source, 'rollbackAuthoringTransaction');
  const settle = bodyFunction(source, 'settleAuthoringTransactionFailure');
  const reject = bodyFunction(source, 'rejectAuthoringCreateTransaction');
  if (!rollback || !settle || !reject) return ['canonical transaction failure helpers are missing'];
  const statements = rollback.body.statements;
  const guard = statements[0];
  const rollbackCall = value(statements[2]);
  const discard = rollbackCall && ts.isCallExpression(rollbackCall) ? rollbackCall.arguments[0] : undefined;
  const discardStatement = discard && ts.isArrowFunction(discard) && ts.isBlock(discard.body) && discard.body.statements.length === 1
    ? discard.body.statements[0] : undefined;
  if (statements.length !== 3 || !ts.isIfStatement(guard)
    || !ts.isPrefixUnaryExpression(guard.expression) || guard.expression.operator !== ts.SyntaxKind.ExclamationToken
    || !property(guard.expression.operand, 'state', 'began') || !ts.isReturnStatement(guard.thenStatement)
    || !ts.isExpressionStatement(statements[1]) || !assignment(statements[1].expression, 'state', 'began', ts.SyntaxKind.FalseKeyword)
    || !rollbackCall || !ts.isCallExpression(rollbackCall) || !ts.isPropertyAccessExpression(rollbackCall.expression)
    || rollbackCall.expression.name.text !== 'catch' || !query(rollbackCall.expression.expression, 'ROLLBACK')
    || !discardStatement || !ts.isExpressionStatement(discardStatement) || !ts.isBinaryExpression(discardStatement.expression)
    || discardStatement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    || !property(discardStatement.expression.left, 'state', 'discardConnection') || !ts.isNewExpression(discardStatement.expression.right)) {
    return ['canonical rollback must await actual client ROLLBACK once and discard a failed connection'];
  }
  const parts = settle.body.statements;
  const unknown = parts[0];
  if (parts.length !== 3 || !ts.isIfStatement(unknown) || !property(unknown.expression, 'state', 'commitAttempted')
    || !ts.isBlock(unknown.thenStatement) || unknown.thenStatement.statements.length !== 2
    || !ts.isExpressionStatement(unknown.thenStatement.statements[0])
    || !ts.isBinaryExpression(unknown.thenStatement.statements[0].expression)
    || unknown.thenStatement.statements[0].expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    || !property(unknown.thenStatement.statements[0].expression.left, 'state', 'discardConnection')
    || !id(unknown.thenStatement.statements[0].expression.right, 'unconfirmed')
    || !ts.isReturnStatement(unknown.thenStatement.statements[1]) || !id(unknown.thenStatement.statements[1].expression, 'unconfirmed')
    || !statementCall(parts[1], 'rollbackAuthoringTransaction', ['client', 'state'])
    || !ts.isReturnStatement(parts[2]) || !id(parts[2].expression, 'error')) {
    return ['failure settlement must discard unknown COMMIT before any rollback and await same-client/state rollback otherwise'];
  }
  const thrown = reject.body.statements[0];
  const rejected = thrown && ts.isThrowStatement(thrown) ? awaited(thrown.expression) : undefined;
  const outcome = rejected?.arguments?.[3];
  if (reject.body.statements.length !== 1 || !call(rejected, 'settleAuthoringTransactionFailure')
    || !['client', 'state', 'error'].every((name, index) => id(rejected.arguments[index], name))
    || !outcome || !ts.isNewExpression(outcome) || !id(outcome.expression, 'AuthoringCreateOutcomeError')
    || outcome.arguments?.length !== 2 || !ts.isStringLiteral(outcome.arguments[0])
    || outcome.arguments[0].text !== 'unconfirmed' || !id(outcome.arguments[1], 'recovery')) {
    return ['document failure must throw the awaited canonical same-client settlement'];
  }
  return [];
}

function transactionFindings(source, name) {
  const fn = bodyFunction(source, name);
  if (!fn) return [`${name}: canonical async owner is missing`];
  const clients = descendants(fn.body, node => ts.isVariableDeclaration(node) && id(node.name, 'client'));
  const bound = clients[0] && awaited(clients[0].initializer);
  if (clients.length !== 1 || !bound || !ts.isCallExpression(bound) || !property(bound.expression, 'pool', 'connect')
    || descendants(fn.body, node => ts.isBinaryExpression(node) && id(node.left, 'client')).length) {
    return [`${name}: client must come once from the actual pool without reassignment`];
  }
  const states = descendants(fn.body, node => ts.isVariableDeclaration(node) && id(node.name, 'transaction'));
  const initial = states[0]?.initializer;
  if (states.length !== 1 || !initial || !ts.isObjectLiteralExpression(initial)
    || !['began', 'commitAttempted'].every(name => initial.properties.some(node => ts.isPropertyAssignment(node)
      && id(node.name, name) && node.initializer.kind === ts.SyntaxKind.FalseKeyword))
    || descendants(fn.body, node => ts.isBinaryExpression(node) && id(node.left, 'transaction')).length) {
    return [`${name}: one unchanged transaction state must record actual BEGIN/COMMIT admission`];
  }
  const transactions = fn.body.statements.filter(ts.isTryStatement);
  const transaction = transactions[0];
  if (transactions.length !== 1 || !transaction.catchClause || !transaction.finallyBlock) return [`${name}: canonical transaction/catch/finally is missing`];
  const statements = transaction.tryBlock.statements;
  const beginIndex = statements.findIndex(statement => begin(value(statement)));
  const commitIndex = statements.findIndex(statement => query(value(statement), 'COMMIT'));
  const beforeCommit = statements[commitIndex - 1];
  if (beginIndex !== 1 || commitIndex <= beginIndex || !ts.isExpressionStatement(statements[0])
    || !assignment(statements[0].expression, 'transaction', 'began', ts.SyntaxKind.TrueKeyword)
    || !beforeCommit || !ts.isExpressionStatement(beforeCommit)
    || !assignment(beforeCommit.expression, 'transaction', 'commitAttempted', ts.SyntaxKind.TrueKeyword)) {
    return [`${name}: actual BEGIN, awaited seed and fenced COMMIT must share one transaction`];
  }
  const seeds = descendants(fn.body, node => call(node, 'insertSectionSeedTx'));
  const seed = seeds[0];
  if (seeds.length !== 1 || !ts.isAwaitExpression(seed.parent) || !id(seed.arguments[0], 'ctx') || !id(seed.arguments[1], 'client')
    || seed.pos < statements[beginIndex].pos || seed.end > statements[commitIndex].pos) return [`${name}: awaited seed must receive this transaction client before COMMIT`];
  let seedStatement = seed;
  while (seedStatement.parent !== transaction.tryBlock && seedStatement.parent) seedStatement = seedStatement.parent;
  if (name === 'insertDocumentTx') {
    if (!ts.isForOfStatement(seedStatement) || !id(seedStatement.expression, 'seeds') || !ts.isBlock(seedStatement.statement)
      || seedStatement.statement.statements.length !== 1) return [`${name}: every seed must be awaited in the direct transaction loop`];
  } else {
    const seedInput = seed.arguments[3];
    if (!ts.isExpressionStatement(seedStatement) || !seedInput || !ts.isObjectLiteralExpression(seedInput)
      || !seedInput.properties.some(node => ts.isPropertyAssignment(node) && id(node.name, 'lineage') && ts.isObjectLiteralExpression(node.initializer))) {
      return [`${name}: direct awaited section seed must request authored lineage`];
    }
  }
  const failureName = name === 'insertDocumentTx' ? 'rejectAuthoringCreateTransaction' : 'settleAuthoringTransactionFailure';
  const failures = descendants(transaction.catchClause.block, node => call(node, failureName));
  const failure = failures[0];
  if (failures.length !== 1 || !ts.isAwaitExpression(failure.parent) || !id(failure.arguments[0], 'client') || !id(failure.arguments[1], 'transaction')
    || !id(failure.arguments[2], transaction.catchClause.variableDeclaration?.name?.text)
    || (name === 'insertDocumentTx' && !ts.isReturnStatement(failure.parent.parent))) return [`${name}: catch must await actual canonical failure settlement on this same client/state`];
  if (name === 'createSection') {
    const declaration = failure.parent.parent;
    const sectionOutcome = failure.arguments[3];
    const outcomeThrow = transaction.catchClause.block.statements[2];
    const duplicateRollbacks = descendants(transaction.tryBlock, node => call(node, 'rollbackAuthoringTransaction'));
    if (!ts.isVariableDeclaration(declaration) || !id(declaration.name, 'err')
      || !transaction.catchClause.block.statements.some(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.includes(declaration))
      || duplicateRollbacks.length !== 1 || !ts.isAwaitExpression(duplicateRollbacks[0].parent)
      || !id(duplicateRollbacks[0].arguments[0], 'client') || !id(duplicateRollbacks[0].arguments[1], 'transaction')) {
      return [`${name}: catch must use the settled error and duplicate refusal must await same-client rollback`];
    }
    if (!sectionOutcome || !ts.isNewExpression(sectionOutcome) || !id(sectionOutcome.expression, 'AuthoringSectionWriteOutcomeError')
      || sectionOutcome.arguments?.length !== 2 || !ts.isStringLiteral(sectionOutcome.arguments[0])
      || sectionOutcome.arguments[0].text !== 'section-create' || !id(sectionOutcome.arguments[1], 'recovery')
      || !outcomeThrow || !ts.isIfStatement(outcomeThrow) || !ts.isBinaryExpression(outcomeThrow.expression)
      || outcomeThrow.expression.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword
      || !id(outcomeThrow.expression.left, 'err') || !id(outcomeThrow.expression.right, 'AuthoringSectionWriteOutcomeError')
      || !ts.isThrowStatement(outcomeThrow.thenStatement) || !id(outcomeThrow.thenStatement.expression, 'err')) {
      return [`${name}: unknown COMMIT must retain and throw the exact typed section recovery before ordinary refusals`];
    }
  }
  const releases = descendants(transaction.finallyBlock, node => ts.isCallExpression(node) && property(node.expression, 'client', 'release'));
  if (releases.length !== 1 || releases[0].arguments.length !== 1 || !property(releases[0].arguments[0], 'transaction', 'discardConnection')
    || transaction.finallyBlock.statements.length !== 1 || !ts.isExpressionStatement(transaction.finallyBlock.statements[0])
    || transaction.finallyBlock.statements[0].expression !== releases[0]) {
    return [`${name}: finally must release this client with the recorded discard outcome`];
  }
  return [];
}

function seedFindings(source) {
  const fn = bodyFunction(source, 'insertSectionSeedTx');
  if (!fn || !id(fn.parameters[1]?.name, 'client') || !imported(source, 'enforceAuthorLineage', '../clinical-regulatory-evidence/lineage-gate')) return ['canonical seed/client/lineage import is missing'];
  if (descendants(fn.body, node => (ts.isBinaryExpression(node) && id(node.left, 'client'))
    || (ts.isVariableDeclaration(node) && id(node.name, 'client'))
    || (query(node) && ts.isStringLiteral(node.arguments[0]) && /^(?:BEGIN|COMMIT|ROLLBACK)\b/.test(node.arguments[0].text))).length) {
    return ['seed must preserve its caller transaction/client without its own commit or rollback'];
  }
  const insert = fn.body.statements.map(value).find(node => query(node)
    && node.arguments[0] && ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
    && /INSERT\s+INTO\s+authoring_sections\s*\([^)]*\bcontent\b/.test(node.arguments[0].text));
  if (!insert) return ['seed content insert must await the same client used by lineage'];
  const values = insert.arguments[1];
  if (!values || !ts.isArrayLiteralExpression(values) || !property(values.elements[4], 'seed', 'content')) return ['seed insert must retain the actual seed content binding'];
  const gates = descendants(fn.body, node => call(node, 'enforceAuthorLineage'));
  const branch = fn.body.statements.find(node => ts.isIfStatement(node) && property(node.expression, 'seed', 'lineage'));
  if (gates.length !== 1 || !ts.isAwaitExpression(gates[0].parent) || !id(gates[0].arguments[0], 'client')
    || !property(gates[0].arguments[3], 'seed', 'content')
    || !branch || !ts.isBlock(branch.thenStatement) || !branch.thenStatement.statements.some(statement => value(statement) === gates[0])) {
    return ['authored seed must await the real lineage gate on the insert client'];
  }
  return [];
}

export function authoringTransactionFindings(texts) {
  const parsed = Object.fromEntries(Object.entries(texts).map(([name, text]) => [name,
    ts.createSourceFile(`${name}.ts`, text ?? '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)]));
  if (Object.values(parsed).some(source => source.parseDiagnostics.length)) return ['canonical authoring source has syntax errors'];
  const { owner, seed, lifecycle } = parsed;
  if (!owner || !seed || !lifecycle) return ['canonical authoring helper sources are missing'];
  if (!imported(owner, 'insertSectionSeedTx', './authoring-section-seed')
    || !['rejectAuthoringCreateTransaction', 'rollbackAuthoringTransaction', 'settleAuthoringTransactionFailure']
      .every(name => imported(owner, name, './authoring-create-outcome'))) return ['canonical authoring seed/transaction imports are missing'];
  return [...transactionFindings(owner, 'insertDocumentTx'), ...transactionFindings(owner, 'createSection'),
    ...lifecycleFindings(lifecycle), ...seedFindings(seed)];
}
