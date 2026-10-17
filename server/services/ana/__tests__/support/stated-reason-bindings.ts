/** Lexical binding lookup used by the stated-reason AST guard and its negative controls. */
import ts from 'typescript';
type Fn = ts.FunctionLikeDeclaration;

/** Resolve registered handlers through wrappers; trailing settings never replace the canonical handler argument. */
export function resolveRegisteredHandler(module: { local: Map<string, Fn> }, node: ts.Node | undefined): Fn | null {
  if (!node) return null;
  if (ts.isFunctionLike(node) && 'body' in node && node.body) return node as Fn;
  if (ts.isIdentifier(node)) return module.local.get(node.text) ?? null;
  if (ts.isCallExpression(node)) {
    const name = ts.isIdentifier(node.expression) ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : null;
    return resolveRegisteredHandler(module, node.arguments[name === 'withCaughtErrors' ? 1 : node.arguments.length - 1]);
  }
  return null;
}

function enclosingFunctions(node: ts.Node): Fn[] {
  const found: Fn[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent) && 'body' in parent && parent.body) found.push(parent as Fn);
  }
  return found;
}

/** Resolve a reason identifier's nearest function parameter or variable without accepting a nested function's binding. */
export function findLexicalBinding(at: ts.Node, name: string): {
  fn: Fn; decl: ts.VariableDeclaration | null; param: ts.ParameterDeclaration | null;
} | null {
  for (const fn of enclosingFunctions(at)) {
    const param = fn.parameters.find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === name) ?? null;
    if (param) return { fn, decl: null, param };
    let decl: ts.VariableDeclaration | null = null;
    const visit = (node: ts.Node) => {
      if (!decl && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && enclosingFunctions(node)[0] === fn) decl = node;
      ts.forEachChild(node, visit);
    };
    visit(fn.body!);
    if (decl) return { fn, decl, param: null };
  }
  return null;
}
