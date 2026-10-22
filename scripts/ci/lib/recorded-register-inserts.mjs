/** Qualify the existing CMC generic INSERT and its concrete, schema-backed calls. */
import path from 'node:path';
import ts from 'typescript';

const HELPER = 'server/services/cmc/register-audit.ts';
const identifier = (node, name) => Boolean(node && ts.isIdentifier(node) && (name === undefined || node.text === name));
const modifier = (node, kind) => node.modifiers?.some(item => item.kind === kind);

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function descendants(node, predicate) {
  const result = [];
  function visit(child) {
    if (predicate(child)) result.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return result;
}

function modulePath(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  if (resolved.startsWith('../')) return undefined;
  return /\.[cm]?[jt]s$/.test(resolved) ? resolved.replace(/\.[cm]?[jt]s$/, '.ts') : `${resolved}.ts`;
}

function imports(source, file) {
  const result = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.importClause?.isTypeOnly) continue;
    const module = modulePath(file, statement.moduleSpecifier.text);
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if (!binding.isTypeOnly) result.set(binding.name.text, {
          name: binding.propertyName?.text ?? binding.name.text, module, declaration: binding,
        });
      }
    }
  }
  return result;
}

function patternBinds(pattern, name) {
  if (identifier(pattern, name)) return true;
  if (pattern && (ts.isArrayBindingPattern(pattern) || ts.isObjectBindingPattern(pattern))) {
    return pattern.elements.some(item => ts.isBindingElement(item) && patternBinds(item.name, name));
  }
  return false;
}

function unchanged(root, name, allowed = []) {
  return descendants(root, node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)
      || ts.isClassDeclaration(node) || ts.isImportSpecifier(node)) && patternBinds(node.name, name)) {
      return !allowed.includes(node);
    }
    if (ts.isBinaryExpression(node) && identifier(unwrap(node.left), name)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
    return (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && identifier(node.operand, name)
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator);
  }).length === 0;
}

function method(node, name, count) {
  node = unwrap(node);
  return node && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === name && node.arguments.length === count ? node : undefined;
}

function helperFunction(source) {
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'insertRegisterRow');
  if (functions.length !== 1) return undefined;
  const fn = functions[0];
  const db = imports(source, HELPER).get('db');
  if (!fn.body || !modifier(fn, ts.SyntaxKind.ExportKeyword) || !modifier(fn, ts.SyntaxKind.AsyncKeyword)
    || fn.parameters.length !== 5 || !fn.parameters.every(parameter => identifier(parameter.name))
    || db?.name !== 'db' || db.module !== 'server/db.ts'
    || !unchanged(source, 'db', [db.declaration])) return undefined;
  return fn;
}

function transactionCallback(fn) {
  if (fn.body.statements.length !== 2 || !ts.isVariableStatement(fn.body.statements[0])
    || !ts.isReturnStatement(fn.body.statements[1])) return undefined;
  const transaction = method(fn.body.statements[1].expression, 'transaction', 1);
  if (!transaction || !identifier(transaction.expression.expression, 'db')) return undefined;
  const callback = transaction.arguments[0];
  if (!ts.isArrowFunction(callback) || !modifier(callback, ts.SyntaxKind.AsyncKeyword)
    || callback.parameters.length !== 1 || !identifier(callback.parameters[0].name)
    || !ts.isBlock(callback.body)) return undefined;
  return callback;
}

function unchangedParameters(fn, callback) {
  const tx = callback.parameters[0].name.text;
  const table = fn.parameters[3].name.text;
  const values = fn.parameters[4].name.text;
  return unchanged(fn, tx, [callback.parameters[0]]) && unchanged(fn, table, [fn.parameters[3]])
    && unchanged(fn, values, [fn.parameters[4]]);
}

function insertedRow(callback) {
  const statements = callback.body.statements;
  if (statements.length < 2 || !ts.isVariableStatement(statements[0])
    || statements[0].declarationList.declarations.length !== 1) return undefined;
  const inserted = statements[0].declarationList.declarations[0];
  if (!ts.isArrayBindingPattern(inserted.name) || inserted.name.elements.length !== 1
    || !ts.isBindingElement(inserted.name.elements[0]) || !identifier(inserted.name.elements[0].name)) return undefined;
  const row = inserted.name.elements[0].name.text;
  const awaited = unwrap(inserted.initializer);
  if (!awaited || !ts.isAwaitExpression(awaited)) return undefined;
  return { row, awaited };
}

function insertsParameters(awaited, fn, callback) {
  const returning = method(awaited.expression, 'returning', 0);
  const populated = returning && method(returning.expression.expression, 'values', 1);
  const insert = populated && method(populated.expression.expression, 'insert', 1);
  return Boolean(insert && identifier(insert.expression.expression, callback.parameters[0].name.text)
    && identifier(insert.arguments[0], fn.parameters[3].name.text)
    && identifier(unwrap(populated.arguments[0]), fn.parameters[4].name.text));
}

function returnsInsertedRow(callback, row) {
  const statements = callback.body.statements;
  if (!ts.isReturnStatement(statements.at(-1)) || !identifier(statements.at(-1).expression, row)) return false;
  // Keep the insert on the executed transaction path: no nested/dead block,
  // early return, throw or conditional between it and the returned row.
  return statements.slice(1, -1).every(statement => ts.isVariableStatement(statement)
    || (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)));
}

function validHelper(source) {
  const fn = helperFunction(source);
  const callback = fn && transactionCallback(fn);
  const inserted = callback && insertedRow(callback);
  return Boolean(inserted && unchangedParameters(fn, callback)
    && insertsParameters(inserted.awaited, fn, callback) && returnsInsertedRow(callback, inserted.row));
}

function registeredRoute(callback, source) {
  const call = callback.parent;
  if (!call || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)
    || call.expression.name.text !== 'post' || !identifier(call.expression.expression)
    || call.arguments.at(-1) !== callback || !ts.isExpressionStatement(call.parent)
    || call.parent.parent !== source) return false;
  const router = call.expression.expression.text;
  const bindings = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .filter(declaration => identifier(declaration.name, router));
  if (bindings.length !== 1) return false;
  const factory = method(bindings[0].initializer, 'Router', 0);
  if (!factory || !identifier(factory.expression.expression)) return false;
  const express = factory.expression.expression.text;
  const imported = source.statements.some(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'express'
    && !statement.importClause?.isTypeOnly && identifier(statement.importClause?.name, express));
  return imported && unchanged(source, router, bindings);
}

function directOwner(block, statement) {
  if (!ts.isBlock(block)) return undefined;
  // The real route writers execute inside the handler's direct try block.
  // Catch/finally, conditionals and uncalled nested functions are not credited.
  while (true) {
    const before = block.statements.slice(0, block.statements.indexOf(statement));
    if (before.some(item => ts.isReturnStatement(item) || ts.isThrowStatement(item))) return undefined;
    if (!ts.isTryStatement(block.parent) || block.parent.tryBlock !== block) break;
    statement = block.parent;
    block = statement.parent;
    if (!ts.isBlock(block)) return undefined;
  }
  return block.parent;
}

function directCreateCall(call, source) {
  if (!ts.isAwaitExpression(call.parent)) return false;
  const declaration = call.parent.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== call.parent
    || !ts.isVariableDeclarationList(declaration.parent) || !ts.isVariableStatement(declaration.parent.parent)) return false;
  const owner = directOwner(declaration.parent.parent.parent, declaration.parent.parent);
  if (!owner) return false;
  return (ts.isFunctionDeclaration(owner) && owner.parent === source && modifier(owner, ts.SyntaxKind.ExportKeyword)
    && modifier(owner, ts.SyntaxKind.AsyncKeyword))
    || (ts.isArrowFunction(owner) && modifier(owner, ts.SyntaxKind.AsyncKeyword) && registeredRoute(owner, source));
}

function calledTable(call, caller, bindings, tableDefinitions) {
  const imported = bindings.get(call.expression.text);
  if (imported?.module !== HELPER || imported.name !== 'insertRegisterRow' || call.arguments.length !== 5
    || !unchanged(caller, call.expression.text, [imported.declaration]) || !directCreateCall(call, caller)
    || !identifier(call.arguments[3])) return undefined;
  const table = bindings.get(call.arguments[3].text);
  if (!table || !tableDefinitions.get(table.name)?.has(table.module)
    || !unchanged(caller, call.arguments[3].text, [table.declaration])) return undefined;
  return table.name;
}

/**
 * sources: repo-relative TypeScript paths -> bytes; tableDefinitions: actual
 * pgTable export names -> defining module paths. No table-name allowlist.
 * This proves the bounded delegated create shape, not whole-program reachability.
 */
export function recordedRegisterInserts(sources, tableDefinitions) {
  const result = new Set();
  const source = ts.createSourceFile(HELPER, sources.get(HELPER) ?? '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length || !validHelper(source)) return result;
  for (const [file, text] of sources) {
    if (file === HELPER || !text.includes('insertRegisterRow')) continue;
    const caller = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (caller.parseDiagnostics.length) continue;
    const bindings = imports(caller, file);
    for (const call of descendants(caller, node => ts.isCallExpression(node) && identifier(node.expression))) {
      const table = calledTable(call, caller, bindings, tableDefinitions);
      if (table) result.add(table);
    }
  }
  return result;
}
