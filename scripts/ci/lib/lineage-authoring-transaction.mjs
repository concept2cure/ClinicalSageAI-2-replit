/** Bounded proof of the canonical authoring seed and transaction call graph. */
import ts from 'typescript';
import { contentWriteCount } from './lineage-content-writers.mjs';

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

// The CSR importer already owns a SERIALIZABLE callback transaction. Prove
// that bounded call graph rather than treating a parameter named `q` as a pool
// or accepting an unrelated BEGIN/helper elsewhere in the file.
const uncast = node => node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node))
  ? uncast(node.expression) : node;
const literal = (node, text) => Boolean(node && ts.isStringLiteral(node) && node.text === text);
const namesAre = (nodes, names) => nodes.length === names.length && names.every((name, index) => id(nodes[index], name));
const referencesAre = (root, name, nodes) => {
  const references = descendants(root, node => id(node, name));
  return references.length === nodes.length && references.every(node => nodes.includes(node));
};
const declaration = (statement, name) => statement && ts.isVariableStatement(statement)
  && statement.declarationList.declarations.length === 1 && id(statement.declarationList.declarations[0].name, name)
  ? statement.declarationList.declarations[0] : undefined;

function importBeginMap(source) {
  const entries = source.statements.map(statement => declaration(statement, 'BEGIN_AT')).filter(Boolean);
  const object = uncast(entries[0]?.initializer);
  if (entries.length !== 1 || !object || !ts.isObjectLiteralExpression(object) || object.properties.length !== 2) return false;
  const expected = new Map([['SERIALIZABLE', 'BEGIN ISOLATION LEVEL SERIALIZABLE'],
    ['REPEATABLE READ', 'BEGIN ISOLATION LEVEL REPEATABLE READ']]);
  return object.properties.every(item => ts.isPropertyAssignment(item)
    && expected.has(item.name.text) && literal(item.initializer, expected.get(item.name.text)))
    && new Set(object.properties.map(item => item.name.text)).size === 2
    && descendants(source, node => id(node, 'BEGIN_AT')).length === 3;
}

function rollbackDiscard(handler) {
  if (!handler || !ts.isArrowFunction(handler) || handler.parameters.length || !ts.isBlock(handler.body)
    || handler.body.statements.length !== 1) return false;
  const action = handler.body.statements[0];
  const expression = ts.isExpressionStatement(action) ? action.expression : undefined;
  return expression && ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && id(expression.left, 'discard') && ts.isNewExpression(expression.right) && id(expression.right.expression, 'Error');
}

function importRollback(transaction) {
  const caught = transaction.catchClause;
  if (!caught || caught.block.statements.length !== 2 || !id(caught.variableDeclaration?.name, 'error')) return false;
  const rollback = value(caught.block.statements[0]);
  if (!rollback || !ts.isCallExpression(rollback) || !ts.isPropertyAccessExpression(rollback.expression)
    || rollback.expression.name.text !== 'catch' || !query(rollback.expression.expression, 'ROLLBACK')) return false;
  return rollback.arguments.length === 1 && rollbackDiscard(rollback.arguments[0])
    && ts.isThrowStatement(caught.block.statements[1]) && id(caught.block.statements[1].expression, 'error');
}

function importRelease(transaction) {
  const statements = transaction.finallyBlock?.statements;
  const release = statements?.length === 1 && ts.isExpressionStatement(statements[0]) ? statements[0].expression : undefined;
  return release && ts.isCallExpression(release) && property(release.expression, 'client', 'release')
    && namesAre(release.arguments, ['discard']);
}

function acquiredImportTransaction(fn) {
  const client = declaration(fn.body.statements[0], 'client');
  const connect = awaited(uncast(client?.initializer));
  const connectOwner = connect && ts.isCallExpression(connect) && ts.isPropertyAccessExpression(connect.expression)
    && connect.expression.name.text === 'connect' ? connect.expression.expression : undefined;
  const discard = declaration(fn.body.statements[1], 'discard');
  const transaction = fn.body.statements[2];
  if (!client || !connectOwner || !property(connectOwner, 'ctx', 'pool') || connect.arguments.length
    || !discard || discard.initializer || !ts.isTryStatement(transaction)) return undefined;
  return transaction;
}

function importBeginCall(opened) {
  const argument = opened?.arguments?.[0];
  return query(opened) && opened.arguments.length === 1 && argument && ts.isElementAccessExpression(argument)
    && id(argument.expression, 'BEGIN_AT') && id(argument.argumentExpression, 'isolation');
}

function importWorkSequence(transaction) {
  const statements = transaction.tryBlock.statements;
  if (statements.length !== 4) return false;
  const result = declaration(statements[1], 'result');
  const work = result && awaited(result.initializer);
  const returned = statements[3];
  return importBeginCall(value(statements[0])) && call(work, 'work') && namesAre(work.arguments, ['client'])
    && query(value(statements[2]), 'COMMIT') && ts.isReturnStatement(returned) && id(returned.expression, 'result');
}

function importWrapperBinding(source, fn) {
  const calls = descendants(source, node => call(node, 'inTransaction'));
  return calls.length === 2 && referencesAre(source, 'inTransaction', [fn.name, ...calls.map(node => node.expression)]);
}

function importWrapperFindings(source) {
  const fn = bodyFunction(source, 'inTransaction');
  if (!fn || !namesAre(fn.parameters.map(parameter => parameter.name), ['ctx', 'isolation', 'work'])
    || fn.body.statements.length !== 3 || !importBeginMap(source) || !importWrapperBinding(source, fn)) return ['CSR transaction wrapper or fixed isolation map changed'];
  const transaction = acquiredImportTransaction(fn);
  if (!transaction || !importWorkSequence(transaction)) return ['CSR work must await its acquired client strictly between actual BEGIN and COMMIT'];
  if (!importRollback(transaction) || !importRelease(transaction)
    || descendants(fn.body, node => id(node, 'client')).length !== 6) return ['CSR failure must await same-client ROLLBACK and release without rebinding'];
  return [];
}

function directAwaitedCall(body, name) {
  const calls = descendants(body, node => call(node, name));
  return calls.length === 1 && body.statements.some(statement => value(statement) === calls[0]) ? calls[0] : undefined;
}

function plainObject(object) {
  if (!object || !ts.isObjectLiteralExpression(object)) return false;
  const supported = object.properties.every(item => (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item))
    && ts.isIdentifier(item.name));
  return supported && new Set(object.properties.map(item => item.name.text)).size === object.properties.length;
}

function objectValue(object, name) {
  if (!plainObject(object)) return undefined;
  const properties = object.properties.filter(item => ts.isPropertyAssignment(item) && id(item.name, name));
  return properties.length === 1 ? uncast(properties[0].initializer) : undefined;
}

function importContentQuery(fn) {
  const calls = descendants(fn.body, node => ts.isCallExpression(node) && property(node.expression, 'q', 'query'));
  const update = calls[0];
  if (calls.length !== 1 || !fn.body.statements.some(statement => value(statement) === update)
    || !literal(update.arguments[0], 'UPDATE authoring_sections SET content = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 AND doc_id = $4 RETURNING id')) return undefined;
  const inputs = update.arguments[1];
  return inputs && ts.isArrayLiteralExpression(inputs) && inputs.elements.length === 4
    && id(inputs.elements[0], 'content') && id(inputs.elements[1], 'sectionId')
    && property(inputs.elements[2], 'ctx', 'tenantId') && property(inputs.elements[3], 'doc', 'id') ? update : undefined;
}

function mutationTarget(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left;
  if (ts.isDeleteExpression(node)) return node.expression;
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return node.operand;
  return undefined;
}

function changesName(root, name) {
  return descendants(root, node => {
    const target = mutationTarget(node);
    return target && descendants(target, child => id(child, name)).length > 0;
  }).length > 0;
}

function storedBinding(fn, name, sourceName) {
  const entries = descendants(fn.body, node => ts.isVariableDeclaration(node) && id(node.name, name));
  const binding = entries[0];
  if (entries.length !== 1 || !(binding.parent.flags & ts.NodeFlags.Const)
    || !binding.initializer || !ts.isNonNullExpression(binding.initializer)) return false;
  return property(binding.initializer.expression, 'section', sourceName) && !changesName(fn.body, name);
}

function importSectionBindings(fn) {
  const scope = fn.parameters[0]?.name;
  if (!scope || !ts.isObjectBindingPattern(scope) || scope.elements.length !== 4
    || !namesAre(scope.elements.map(element => element.name), ['q', 'ctx', 'input', 'admitted'])
    || scope.elements.some(element => element.propertyName || element.initializer || element.dotDotDotToken)) return undefined;
  if (!storedBinding(fn, 'content', 'stored') || !storedBinding(fn, 'sectionId', 'sectionId')) return undefined;
  return scope.elements[0].name;
}

function transactionControl(body) {
  return descendants(body, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'query' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && /^(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(node.arguments[0].text.trim())).length > 0;
}

function lineageActor(node) {
  return node && ts.isPropertyAccessExpression(node) && node.name.text === 'id' && property(node.expression, 'ctx', 'actor');
}

function importLineageTarget(target) {
  return plainObject(target) && target.properties.length === 2
    && literal(objectValue(target, 'documentTable'), 'authoring_sections') && id(objectValue(target, 'documentId'), 'sectionId');
}

function importLineageIdentity(gate) {
  return gate && gate.arguments.length === 6 && id(gate.arguments[0], 'q')
    && property(gate.arguments[1], 'ctx', 'tenantId') && id(gate.arguments[3], 'content') && lineageActor(gate.arguments[4]);
}

function importSectionGate(update, gate) {
  return update && importLineageIdentity(gate) && update.end < gate.pos && importLineageTarget(gate.arguments[2])
    && id(objectValue(objectValue(gate.arguments[5], 'machineDraft'), 'authorId'), 'WORKFLOW_IMPORT_AUTHOR_ID');
}

function importSectionReferences(fn, q, update, gate, clients) {
  return clients.every(node => id(node, 'q')) && !transactionControl(fn.body)
    && referencesAre(fn, 'q', [q, update.expression.expression, gate.arguments[0], ...clients]);
}

function importSectionFindings(source) {
  const fn = bodyFunction(source, 'writeSection');
  const q = fn && importSectionBindings(fn);
  if (!q || !namesAre(fn.parameters.slice(1).map(parameter => parameter.name), ['section', 'approval'])) return ['CSR section scope or actual stored-content bindings changed'];
  const update = importContentQuery(fn);
  const gate = directAwaitedCall(fn.body, 'enforceAuthorLineage');
  const revision = directAwaitedCall(fn.body, 'createRevision');
  const filing = directAwaitedCall(fn.body, 'commitSectionToFiling');
  const audit = directAwaitedCall(fn.body, 'writeAuthoringAuditTrail');
  if (!importSectionGate(update, gate) || !revision || !filing || !audit
    || descendants(fn.body, ts.isReturnStatement).length || changesName(fn.body, 'ctx')) return ['CSR content UPDATE must reach canonical lineage with unchanged stored bytes, section, tenant and actor'];
  const revisionClient = revision.arguments[0];
  const filingClient = objectValue(filing.arguments[0], 'client');
  const auditClient = objectValue(audit.arguments[1], 'executor');
  if (!importSectionReferences(fn, q, update, gate, [revisionClient, filingClient, auditClient])) {
    return ['CSR write, lineage, revision, filing and audit must retain the same unshadowed callback client'];
  }
  return [];
}

function importScope(callback) {
  const scopes = callback.body.statements.map(statement => declaration(statement, 'scope')).filter(Boolean);
  const scope = scopes[0];
  const initial = scope?.initializer;
  return scopes.length === 1 && initial && ts.isObjectLiteralExpression(initial) && initial.properties.length === 4
    && initial.properties.every((item, index) => ts.isShorthandPropertyAssignment(item)
      && id(item.name, ['q', 'ctx', 'input', 'admitted'][index])) ? scope : undefined;
}

function importSectionLoop(callback) {
  const loops = callback.body.statements.filter(ts.isForOfStatement);
  const loop = loops[0];
  const write = loop && value(loop.statement);
  return loops.length === 1 && id(loop.expression, 'writes') && call(write, 'writeSection')
    && id(write.arguments[0], 'scope') && id(write.arguments[1], 'section') ? write : undefined;
}

function importWriteCallback(source) {
  const fn = bodyFunction(source, 'writeImport');
  const returned = fn?.body.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]) ? fn.body.statements[0].expression : undefined;
  if (!call(returned, 'inTransaction') || returned.arguments.length !== 3 || !id(returned.arguments[0], 'ctx')
    || !literal(returned.arguments[1], 'SERIALIZABLE')) return undefined;
  const callback = returned.arguments[2];
  if (!ts.isArrowFunction(callback) || !callback.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)
    || !namesAre(callback.parameters.map(parameter => parameter.name), ['q']) || !ts.isBlock(callback.body)) return undefined;
  return callback;
}

function importCallbackWork(callback) {
  const scope = importScope(callback);
  const write = importSectionLoop(callback);
  const admit = directAwaitedCall(callback.body, 'admitAndPlan');
  const approved = directAwaitedCall(callback.body, 'approvals');
  const fingerprints = descendants(callback.body, node => call(node, 'recordedFingerprint'));
  const fingerprint = fingerprints[0];
  if (!scope || !write || !admit || !approved || fingerprints.length !== 1 || !ts.isAwaitExpression(fingerprint.parent)
    || !id(admit.arguments[0], 'q') || !id(approved.arguments[0], 'q') || !id(fingerprint.arguments[0], 'q')) return undefined;
  const records = descendants(callback.body, node => call(node, 'recordImport'));
  const record = records[0];
  return records.length === 1 && ts.isAwaitExpression(record.parent) && id(record.arguments[0], 'scope')
    ? { scope, write, admit, approved, fingerprint, record } : undefined;
}

function importCallbackReferences(callback, work) {
  const { scope, write, admit, approved, fingerprint, record } = work;
  const shorthand = scope.initializer.properties[0].name;
  return !transactionControl(callback.body)
    && referencesAre(callback, 'q', [callback.parameters[0].name, admit.arguments[0], approved.arguments[0], shorthand, fingerprint.arguments[0]])
    && referencesAre(callback, 'scope', [scope.name, write.arguments[0], record.arguments[0]]);
}

function importCallbackFindings(source) {
  const callback = importWriteCallback(source);
  if (!callback) return ['CSR write must enter the actual SERIALIZABLE wrapper with its async q callback'];
  const work = importCallbackWork(callback);
  if (!work || !importCallbackReferences(callback, work)) return ['CSR callback must await admitted writes without rebinding, committing or replacing q/scope'];
  const { write } = work;
  if (!referencesAre(source, 'writeSection', [bodyFunction(source, 'writeSection')?.name, write.expression])) return ['every CSR section write must run through the awaited transaction loop'];
  return [];
}

export function csrImportTransactionFindings(text) {
  const source = ts.createSourceFile('csr-import.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) return ['CSR import source has syntax errors'];
  if (!imported(source, 'enforceAuthorLineage', '../clinical-regulatory-evidence/lineage-gate')
    || descendants(source, node => id(node, 'enforceAuthorLineage')).length !== 2) return ['CSR import must use the unshadowed canonical author-lineage helper'];
  if (contentWriteCount(text, ['authoring_sections']) !== 1) return ['CSR import has an unreviewed additional or missing content writer'];
  return [...importWrapperFindings(source), ...importSectionFindings(source), ...importCallbackFindings(source)];
}
