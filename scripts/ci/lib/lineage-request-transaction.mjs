/** Recognize the specific request-pinned Protocol transaction, not its name alone. */
import ts from 'typescript';

export const PROTOCOL_REQUEST_TRANSACTION = Object.freeze({
  wrapper: 'governedScoped',
  forwarder: 'governed',
  requestModule: '../db/requestDb',
  writerModule: '../services/protocol-development/protocol-development-service',
  writers: ['updateSectionTx', 'updateSynopsisTx'],
});

const identifier = (node, name) => Boolean(node && ts.isIdentifier(node) && (name === undefined || node.text === name));
const namedCall = (node, name) => Boolean(node && ts.isCallExpression(node) && identifier(node.expression, name));
const awaited = (node) => node && ts.isAwaitExpression(node) ? node.expression : undefined;
const isAsync = (node) => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword);

function descendants(node, predicate) {
  const matches = [];
  function visit(child) {
    if (predicate(child)) matches.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return matches;
}

function imported(source, name, module) {
  return source.statements.some(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === module
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(element => identifier(element.name, name)
      && (!element.propertyName || identifier(element.propertyName, name))));
}

function bodyFunction(source, name) {
  const functions = source.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  return functions.length === 1 && functions[0].body && isAsync(functions[0]) ? functions[0] : undefined;
}

function query(node, client, statement) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && identifier(node.expression.expression, client) && node.expression.name.text === 'query'
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === statement;
}

function statementValue(statement) {
  if (ts.isExpressionStatement(statement)) return awaited(statement.expression);
  if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    const initializer = statement.declarationList.declarations[0].initializer;
    return initializer && awaited(initializer);
  }
  return undefined;
}

function bindsOrChanges(node, name) {
  return descendants(node, child => (ts.isVariableDeclaration(child) && identifier(child.name, name))
    || (ts.isParameter(child) && identifier(child.name, name))
    || (ts.isBinaryExpression(child) && identifier(child.left, name)
      && child.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && child.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
    || ((ts.isPrefixUnaryExpression(child) || ts.isPostfixUnaryExpression(child)) && identifier(child.operand, name)));
}

function requestClientBinding(source, wrapper, contract) {
  const requestName = wrapper.parameters[0].name.text;
  const bindings = descendants(wrapper.body, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && identifier(node.left) && namedCall(node.right, 'requestPgClient'));
  if (!imported(source, 'requestPgClient', contract.requestModule) || bindings.length !== 1
    || bindings[0].right.arguments.length !== 1 || !identifier(bindings[0].right.arguments[0], requestName)) {
    return { findings: ['transaction client is not bound once to canonical requestPgClient(req)'] };
  }
  const client = bindings[0].left.text;
  const bindingTry = bindings[0].parent.parent.parent;
  if (!ts.isExpressionStatement(bindings[0].parent) || !ts.isTryStatement(bindingTry)
    || bindingTry.parent !== wrapper.body || bindingTry.tryBlock.statements.length !== 1
    || !bindingTry.catchClause || !ts.isReturnStatement(bindingTry.catchClause.block.statements.at(-1))) {
    return { findings: ['request-client binding must execute directly and return on unavailable context'] };
  }
  const changes = bindsOrChanges(wrapper.body, client);
  if (changes.length !== 2 || !changes.includes(bindings[0]) || !changes.some(ts.isVariableDeclaration)) {
    return { findings: ['transaction client is reassigned or shadowed after its canonical request binding'] };
  }
  return { client, bindingTry, findings: [] };
}

function requestTransaction(wrapper, client, bindingTry) {
  const transactions = wrapper.body.statements.filter(statement => ts.isTryStatement(statement)
    && statement.tryBlock.statements.some(inner => {
      const value = statementValue(inner);
      return value && query(value, client, 'BEGIN');
    }));
  if (transactions.length !== 1) return { findings: ['wrapper does not contain one direct request-client BEGIN transaction'] };
  const transaction = transactions[0];
  if (wrapper.body.statements.indexOf(bindingTry) >= wrapper.body.statements.indexOf(transaction)) {
    return { findings: ['request client must be acquired before the transaction begins'] };
  }
  return { transaction, findings: [] };
}

function callbackFindings(wrapper, transaction, client, runName) {
  const values = [...transaction.tryBlock.statements].map(statementValue);
  const begin = values.findIndex(value => value && query(value, client, 'BEGIN'));
  const commit = values.findIndex(value => value && query(value, client, 'COMMIT'));
  const callbacks = descendants(wrapper.body, node => namedCall(node, runName));
  const callback = values.findIndex(value => value && namedCall(value, runName));
  if (begin !== 0 || callback <= begin || commit <= callback || callbacks.length !== 1
    || !identifier(values[callback].arguments[0], client)
    || values.filter(value => value && query(value, client, 'BEGIN')).length !== 1
    || values.filter(value => value && query(value, client, 'COMMIT')).length !== 1) {
    return ['awaited callback must receive that same client between BEGIN and COMMIT'];
  }
  return directSequenceFindings(transaction, client, values, { begin, callback, commit });
}

function directSequenceFindings(transaction, client, values, { begin, callback, commit }) {
  if (transaction.tryBlock.statements.slice(begin, commit + 1).some(statement => !statementValue(statement))) {
    return ['transaction callback/commit ordering is conditional or not a direct awaited sequence'];
  }
  const governance = values.findIndex(value => value && namedCall(value, 'recordGovernedAction') && identifier(value.arguments[0], client));
  if (governance <= callback || governance >= commit) return ['governance must use the same client after the callback and before COMMIT'];
  const rollback = transaction.catchClause?.block.statements[0];
  let value = rollback && statementValue(rollback);
  if (value && ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) && value.expression.name.text === 'catch') value = value.expression.expression;
  if (!value || !query(value, client, 'ROLLBACK')) return ['transaction catch must await ROLLBACK on that same request client'];
  return [];
}

function wrapperFindings(source, contract) {
  const wrapper = bodyFunction(source, contract.wrapper);
  if (!wrapper) return ['canonical transaction wrapper is missing or not an async function'];
  if (wrapper.parameters.length !== 5 || !wrapper.parameters.every(parameter => identifier(parameter.name))) {
    return ['transaction wrapper parameters are not the expected request and callback contract'];
  }
  const binding = requestClientBinding(source, wrapper, contract);
  if (binding.findings.length) return binding.findings;
  const result = requestTransaction(wrapper, binding.client, binding.bindingTry);
  if (result.findings.length) return result.findings;
  return callbackFindings(wrapper, result.transaction, binding.client, wrapper.parameters[4].name.text);
}

function forwarderFindings(source, contract) {
  const forwarder = bodyFunction(source, contract.forwarder);
  if (!forwarder || forwarder.parameters.length !== 5 || !forwarder.parameters.every(parameter => identifier(parameter.name))
    || forwarder.body.statements.length !== 1 || !ts.isReturnStatement(forwarder.body.statements[0])) {
    return ['governed forwarder is missing or no longer directly returns the canonical transaction'];
  }
  const returned = forwarder.body.statements[0].expression;
  const call = returned && (ts.isAwaitExpression(returned) ? returned.expression : returned);
  if (!call || !namedCall(call, contract.wrapper) || call.arguments.length !== forwarder.parameters.length
    || !call.arguments.every((argument, index) => identifier(argument, forwarder.parameters[index].name.text))) {
    return ['governed forwarder does not pass its unchanged request and callback to governedScoped'];
  }
  return [];
}

function governedInvocation(callback, contract) {
  const invocation = callback?.parent;
  return invocation && (namedCall(invocation, contract.wrapper) || namedCall(invocation, contract.forwarder))
    && invocation.arguments[invocation.arguments.length - 1] === callback
    && (ts.isAwaitExpression(invocation.parent) || ts.isReturnStatement(invocation.parent));
}

function writerUsesCallbackClient(call, callback) {
  const client = callback?.parameters[0]?.name;
  return callback && isAsync(callback) && identifier(client) && ts.isAwaitExpression(call.parent)
    && identifier(call.arguments[0], client.text) && bindsOrChanges(callback.body, client.text).length === 0;
}

function writerFindings(source, contract) {
  const findings = [];
  for (const writer of contract.writers) {
    const calls = descendants(source, node => namedCall(node, writer));
    if (!imported(source, writer, contract.writerModule) || calls.length === 0) {
      findings.push(`${writer} must be imported from the actual service and called through the governed callback`);
      continue;
    }
    for (const call of calls) {
      let callback = call.parent;
      while (callback && !ts.isFunctionLike(callback)) callback = callback.parent;
      if (!governedInvocation(callback, contract) || !writerUsesCallbackClient(call, callback)) {
        findings.push(`${writer} must await the governed callback's unchanged first client; detached or different clients are refused`);
      }
    }
  }
  return findings;
}

export function requestScopedTransactionFindings(text, contract = PROTOCOL_REQUEST_TRANSACTION) {
  const source = ts.createSourceFile('transaction-owner.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) return ['transaction owner has TypeScript syntax errors'];
  return [...wrapperFindings(source, contract), ...forwarderFindings(source, contract), ...writerFindings(source, contract)];
}
