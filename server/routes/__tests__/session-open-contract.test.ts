/**
 * Every sign-in mints its session through openSession, which registers the
 * session against the account's concurrent-session limit (security audit
 * 2026-09-24, IAM-06; plan P1-1). A mint that calls newSessionClaims directly
 * would open a session the limit never sees, so the routes may not call it.
 *
 * And every access token the server signs, wherever it is signed, carries the
 * session claims (plan P1-38, the IAM-02 / IAM-06 residuals of the 2026-09-26
 * lens): a `jwt.sign` whose payload says `type: 'access'` must spread a session
 * — the one openSession or openConnectorSession opened, or the one
 * continuedSessionClaims carries through a refresh, a rotation or an
 * organisation switch. A bare access mint holds no slot, has no idle window
 * and no lifetime, and is refused here by name. The first two found that way
 * were the first-run setup token (routes/setup.ts) and the connector token
 * (mcp/auth/platform-token.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const read = (file: string) => readFileSync(join(here, '..', file), 'utf8');

/** Every server source file that is not a test. */
function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue;
      yield* sourceFiles(path);
    } else if (/\.(?:[cm]?js|ts)$/.test(entry.name) && !/\.(?:test|spec|dbtest)\.[cm]?[jt]s$/.test(entry.name)) {
      yield path;
    }
  }
}

interface Mint {
  file: string;
  line: number;
  /** The payload's text: the first argument's object literal, or null when it is not a literal. */
  payload: string | null;
}

/** Every `jwt.sign(` call in the file with its payload literal. */
function mintsIn(file: string, source: string): Mint[] {
  const mints: Mint[] = [];
  const call = /\bjwt\.sign\(/g;
  for (let m = call.exec(source); m; m = call.exec(source)) {
    let i = m.index + m[0].length;
    // Whitespace and comments between the call and its payload.
    for (;;) {
      if (/\s/.test(source[i] ?? '')) i += 1;
      else if (source.startsWith('//', i)) i = source.indexOf('\n', i) + 1 || source.length;
      else if (source.startsWith('/*', i)) {
        const close = source.indexOf('*/', i);
        i = close === -1 ? source.length : close + 2;
      } else break;
    }
    const line = source.slice(0, m.index).split('\n').length;
    if (source[i] !== '{') {
      mints.push({ file, line, payload: null });
      continue;
    }
    let depth = 0;
    let end = i;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}' && (depth -= 1) === 0) break;
    }
    mints.push({ file, line, payload: source.slice(i, end + 1) });
  }
  return mints;
}

const ACCESS = /\btype\s*:\s*['"]access['"]/;
/** A session spread: `...session`, `...devSession`, `...(await openSession(…))`, `...continuedSessionClaims(…)`. */
const SESSION_SPREAD = /\.\.\.\s*(?:\(\s*await\s+)?(?:open(?:Connector)?Session\(|continuedSessionClaims\(|[\w$]*[sS]ession[\w$]*\b)/;
const SESSION_SOURCE = /\b(?:openSession|openConnectorSession|continuedSessionClaims)\(/;

interface FederatedSources { sso: string; challenge: string; mfa: string; auth: string }
const federatedSources: FederatedSources = {
  sso: read('sso.ts'), challenge: read('../services/auth/saml-login-challenge.ts'),
  mfa: read('../services/mfaService.ts'), auth: read('auth.ts'),
};
const parsed = (text: string) => ts.createSourceFile('session.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
const named = (node: ts.Node | undefined, name: string) => !!node && ts.isIdentifier(node) && node.text === name;
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  return nodes(root, ts.isCallExpression).filter(call => named(call.expression, name)
    || ts.isPropertyAccessExpression(call.expression) && call.expression.getText().replace(/\s/g, '') === name);
}
function imported(source: ts.SourceFile, name: string, module: string): boolean {
  return source.statements.some(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === module
    && !statement.importClause?.isTypeOnly && statement.importClause?.namedBindings
    && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(binding => !binding.isTypeOnly
      && named(binding.name, name) && !binding.propertyName));
}
function fn(source: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  return source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && named(node.name, name));
}
function route(source: ts.SourceFile, path: string): ts.Block | undefined {
  const handler = calls(source, 'router.post').find(call => ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === path)?.arguments.at(-1);
  if (!handler || !ts.isArrowFunction(handler) || !ts.isBlock(handler.body)) return undefined;
  return handler.body.statements.find(ts.isTryStatement)?.tryBlock;
}
function directAwait(block: ts.Block, name: string): ts.CallExpression | undefined {
  return calls(block, name).find(call => ts.isAwaitExpression(call.parent) && ts.isVariableDeclaration(call.parent.parent)
    && call.parent.parent.initializer === call.parent && call.parent.parent.parent.parent.parent === block);
}
function refusal(block: ts.Block, name: string): ts.IfStatement | undefined {
  return block.statements.find((node): node is ts.IfStatement => ts.isIfStatement(node)
    && ts.isAwaitExpression(node.expression) && ts.isCallExpression(node.expression.expression)
    && named(node.expression.expression.expression, name) && ts.isReturnStatement(node.thenStatement) && !node.elseStatement);
}

/** Bounded source hand-off/order check; runtime SSO/MFA companions exercise the factors. */
function samlSessionFindings(texts: FederatedSources): string[] {
  const unreadable = Object.values(texts).some(text => ts.transpileModule(text, {
    fileName: 'session.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest },
  }).diagnostics?.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error));
  if (unreadable) return ['unreadable session source'];
  const [sso, challenge, mfa, auth] = [texts.sso, texts.challenge, texts.mfa, texts.auth].map(parsed);
  return [...samlChallengeFindings(sso, challenge), ...challengeMintFindings(mfa), ...mfaSessionFindings(auth)];
}

function samlChallengeFindings(sso: ts.SourceFile, challenge: ts.SourceFile): string[] {
  const first = route(sso, '/saml/callback');
  const issuer = fn(challenge, 'issueSamlLoginChallenge');
  if (!first || !imported(sso, 'issueSamlLoginChallenge', '../services/auth/saml-login-challenge')
    || !directAwait(first, 'issueSamlLoginChallenge') || calls(first, 'openSession').length || calls(first, 'jwt.sign').length
    || !issuer?.body || !imported(challenge, 'createSamlMfaChallengeToken', '../mfaService')
    || !calls(issuer.body, 'createSamlMfaChallengeToken').length || calls(issuer.body, 'openSession').length
    || calls(issuer.body, 'jwt.sign').length) return ['SAML must delegate its first factor to the canonical challenge issuer without opening a session'];
  return [];
}

function challengeMintFindings(mfa: ts.SourceFile): string[] {
  const wrapper = fn(mfa, 'createSamlMfaChallengeToken');
  const signer = fn(mfa, 'signMfaChallenge');
  const mint = signer && calls(signer, 'jwt.sign')[0];
  if (!wrapper || !calls(wrapper, 'signMfaChallenge').length || !mint || !ts.isObjectLiteralExpression(mint.arguments[0])
    || !mint.arguments[0].properties.some(property => ts.isPropertyAssignment(property) && named(property.name, 'type')
      && ts.isStringLiteral(property.initializer) && property.initializer.text === 'mfa_challenge')) return ['SAML must issue the shared MFA challenge token type'];
  return [];
}

function canonicalStanding(auth: ts.SourceFile, standing: ts.Block): boolean {
  return imported(auth, 'openSession', '../services/session-inactivity')
    && imported(auth, 'readAccountStanding', '../services/account-standing')
    && !!directAwait(standing, 'readAccountStanding') && calls(standing, 'sessionEndedByStanding').length === 1
    && calls(standing, 'isAccountLocked').length === 1;
}

function registeredAccessSession(session: ts.CallExpression, access: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(session.arguments[0]) && session.arguments[0].getText() === 'challenge.userId'
    && ts.isObjectLiteralExpression(access.arguments[0])
    && access.arguments[0].properties.some(property => ts.isSpreadAssignment(property) && named(property.expression, 'session'));
}

function mfaSessionFindings(auth: ts.SourceFile): string[] {
  const block = route(auth, '/mfa/verify');
  const standing = fn(auth, 'refuseAccountAtSecondFactor');
  if (!block || !standing?.body) return ['canonical MFA completion is missing'];
  const gate = refusal(block, 'refuseAccountAtSecondFactor');
  const factorGate = block.statements.find((node): node is ts.IfStatement => ts.isIfStatement(node)
    && ts.isPrefixUnaryExpression(node.expression) && node.expression.operator === ts.SyntaxKind.ExclamationToken
    && named(node.expression.operand, 'isValid') && ts.isReturnStatement(node.thenStatement)
    && calls(node.thenStatement, 'refuseWrongSecondFactor').length === 1);
  const session = directAwait(block, 'openSession');
  const access = calls(block, 'jwt.sign').find(call => ts.isObjectLiteralExpression(call.arguments[0])
    && call.arguments[0].properties.some(property => ts.isPropertyAssignment(property) && named(property.name, 'type')
      && ts.isStringLiteral(property.initializer) && property.initializer.text === 'access'));
  const factorCalls = [...calls(block, 'emailOtpService.verifyEmailOtp'), ...calls(block, 'mfaService.verifyLoginSecondFactor')];
  if (!gate || !factorGate || !session || !access
    || !canonicalStanding(auth, standing.body) || factorCalls.length !== 2
    || !factorCalls.every(call => call.pos > gate.end && call.end < factorGate.pos)
    || gate.end >= factorGate.pos || factorGate.end >= session.pos || session.end >= access.pos
    || !registeredAccessSession(session, access)) {
    return ['MFA must check standing and factors before opening and spreading the registered session'];
  }
  return [];
}

describe('sign-in mints register their session', () => {
  it('no route mints session claims without registering them', () => {
    for (const file of ['auth.ts', 'authEnterprise.ts', 'sso.ts']) {
      expect(read(file), `${file} mints a session the concurrent-session limit never sees`).not.toMatch(/\bnewSessionClaims\(/);
    }
  });

  it('each sign-in door opens its session through openSession', () => {
    // auth.ts: the dev sign-in, the sign-in, the sign-up, the MFA completion.
    expect(read('auth.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // authEnterprise.ts: the MFA completion.
    expect(read('authEnterprise.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // sso.ts: development only; SAML completes at the shared MFA door below.
    expect(read('sso.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // setup.ts: the first-run bootstrap token.
    expect(read('setup.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('every access token the server signs carries a session (P1-38)', () => {
  const mints: Mint[] = [];
  const sources = new Map<string, string>();
  for (const file of sourceFiles(serverRoot)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('jwt.sign(')) continue;
    sources.set(file, source);
    mints.push(...mintsIn(file, source));
  }
  const name = (m: Mint) => `${relative(serverRoot, m.file)}:${m.line}`;

  it('finds the mints (the scan is not empty and every payload is a literal it can read)', () => {
    expect(mints.length).toBeGreaterThanOrEqual(12);
    expect(mints.filter(m => m.payload === null).map(name), 'a jwt.sign whose payload is not an object literal cannot be checked here').toEqual([]);
  });

  it('a type:access payload spreads the session openSession, openConnectorSession or continuedSessionClaims gave it', () => {
    const access = mints.filter(m => m.payload !== null && ACCESS.test(m.payload));
    // SAML's former direct mint is now the shared MFA completion's mint.
    expect(access.length).toBeGreaterThanOrEqual(11);
    const bare = access.filter(m => !SESSION_SPREAD.test(m.payload as string));
    expect(bare.map(name), 'access tokens minted outside openSession / openConnectorSession: no slot, no idle window, no lifetime').toEqual([]);
  });

  it('a file that mints an access token gets its session from the service, never from newSessionClaims', () => {
    for (const [file, source] of sources) {
      if (!mintsIn(file, source).some(m => m.payload !== null && ACCESS.test(m.payload))) continue;
      const rel = relative(serverRoot, file);
      expect(source, `${rel} mints an access token without opening or continuing a session`).toMatch(SESSION_SOURCE);
      expect(source, `${rel} mints a session the concurrent-session limit never sees`).not.toMatch(/\bnewSessionClaims\(/);
    }
  });
});

describe('SAML first factor reaches the registered canonical MFA session', () => {
  it('delegates the challenge and checks current standing and factors before access issuance', () => {
    expect(samlSessionFindings(federatedSources)).toEqual([]);
  });

  const mutations: Array<[string, keyof FederatedSources, string, string]> = [
    ['unreadable SAML source', 'sso', 'const router = Router();', 'const = Router();'],
    ['missing first-factor delegation', 'sso', 'await issueSamlLoginChallenge({', 'await bypassSamlChallenge({'],
    ['alternate challenge issuer', 'sso', "from '../services/auth/saml-login-challenge'", "from '../services/auth/alternate-challenge'"],
    ['premature SAML session', 'sso', 'const challenge = await issueSamlLoginChallenge({', "await openSession('unexpected'); const challenge = await issueSamlLoginChallenge({"],
    ['missing shared challenge signer', 'challenge', 'createSamlMfaChallengeToken({', 'bypassSamlMfaChallengeToken({'],
    ['access token instead of a challenge', 'mfa', "{ ...claims, type: 'mfa_challenge' }", "{ ...claims, type: 'access' }"],
    ['missing account-standing refusal', 'auth', 'if (await refuseAccountAtSecondFactor(req, res, challenge, userId, challengeId)) return;', 'if (false) return;'],
    ['missing email factor', 'auth', 'emailOtpService.verifyEmailOtp(userId, code)', 'emailOtpService.skippedFactor(userId, code)'],
    ['missing authenticator factor', 'auth', 'mfaService.verifyLoginSecondFactor(userId, code)', 'mfaService.skippedFactor(userId, code)'],
    ['missing factor refusal', 'auth', 'if (!isValid) return await refuseWrongSecondFactor(req, res, challenge, userId, authenticatorAccount);', 'if (false) return;'],
    ['missing session registration', 'auth', 'await openSession(challenge.userId, sessionOrg?.settings)', 'await skippedSession(challenge.userId, sessionOrg?.settings)'],
    ['missing access session spread', 'auth', "...(challenge.provider === 'saml' ? { provider: 'saml', sessionIndex: challenge.sessionIndex } : {}),\n        ...session,", "...(challenge.provider === 'saml' ? { provider: 'saml', sessionIndex: challenge.sessionIndex } : {}),"],
  ];
  it.each(mutations)('refuses %s in the actual source', (_name, file, before, after) => {
    expect(federatedSources[file]).toContain(before);
    expect(samlSessionFindings({ ...federatedSources, [file]: federatedSources[file].replace(before, after) })).not.toEqual([]);
  });
});
