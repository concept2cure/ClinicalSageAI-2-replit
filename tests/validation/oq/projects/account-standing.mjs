/**
 * OQ-PROJ-18 (URS-PROJ-012): an account taken out of use can do nothing, and
 * works again when restored. run.mjs names the step (its id and requirement,
 * which ci:validation-traceability reads there); what it does, what it expects
 * and how it runs are here, so each part stays small enough to read.
 */
import { passwordLogin } from '../../lib/harness.mjs';
import { STANDING_CREDENTIALS_NOT_SUPPLIED, standingCredentials } from '../../lib/credentials.mjs';

/** The step's text, as OQ-001 §3 gives it; the harness writes it into the record. */
export const ACCOUNT_STANDING_TEXT = {
  title: 'An account taken out of use can do nothing, and works again when restored',
  action:
    'Credentialed. Sign in as the standing subject (OQ_STANDING_EMAIL: password and authenticator code) and GET /api/c2c/projects with that session. As the platform administrator (OQ_PLATFORM_ADMIN_EMAIL), PATCH /api/admin/master/users/:subjectId/status {status:"suspended", reason}. With the subject\'s session: GET /api/c2c/projects and GET /api/auth/session; then POST /api/auth/login as the subject. Read the ledger (GET /api/audit-trail/ledger?limit=50) with the run session before and after. Then PATCH {status:"active", reason} and read projects with the subject\'s session again',
  expected:
    'Projects 200 before; the suspension 200. Suspended: the subject\'s session reads projects 401 ACCOUNT_INACTIVE; the session check answers authenticated=false with AUTH_ACCOUNT_INACTIVE; the password step answers 403 AUTH_ACCOUNT_INACTIVE and issues no challenge; the newest ledger entry the step added for the subject reads "Sign-in refused: the account is not active (suspended or deprovisioned)", hash-chained. Restored: the same session reads projects 200. Without the two credentials the step is recorded "not executed — credential not supplied"',
  note: 'Until VSR-001 F-28 and F-29 (2026-09-23) nothing read users.status except the release signature: a suspended or deprovisioned account signed in, signed, and kept every session it held. Taking an account out of use needs a platform administrator or the identity provider, so the step needs a platform administrator\'s credential; the account it suspends is one no other step uses, and it is restored in every outcome. A restored account\'s unexpired sessions work again: the check reads the standing, it does not revoke (VSR-001 §16). The platform administrator is a member, not an administrator, of its organisation, and the record names its role: Master Administration admits the platform role alone (VSR-001 F-31).',
};

const REFUSAL = 'Sign-in refused: the account is not active (suspended or deprovisioned)';
const LEDGER = '/api/audit-trail/ledger?limit=50';
const PROJECTS = '/api/c2c/projects';

/** The two identities, or a deviation: none supplied, or a subject other steps use. */
function identities(deviation) {
  const creds = standingCredentials();
  if (!creds) deviation(STANDING_CREDENTIALS_NOT_SUPPLIED);
  const reserved = [process.env.VALIDATION_USER_EMAIL, process.env.OQ_SIGNER_EMAIL].map((e) => (e || '').trim().toLowerCase());
  if (reserved.includes(creds.subject.email)) {
    deviation(`not executed — OQ_STANDING_EMAIL is an identity other steps use (${creds.subject.email}); the step suspends it, so it needs one of its own.`);
  }
  return creds;
}

/** A call with a session of the step's own; its traffic is not the run session's, so it is not recorded. */
function caller(baseUrl) {
  return async (token, method, route, body) => {
    const r = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Origin: baseUrl, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
}

const codeOf = (json) => json?.code ?? json?.error?.code ?? null;

/** The account's organisation role, as its session reports it. */
const organisationRole = (session) => (session.user.roles ?? []).find((r) => r !== 'user') ?? 'user';

/** What the suspended account's session, and its password, are answered. No factor reaches a record. */
async function whileSuspended({ call, baseUrl, subject, creds }) {
  const read = await call(subject.accessToken, 'GET', PROJECTS);
  const probe = await call(subject.accessToken, 'GET', '/api/auth/session');
  const signIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: creds.subject.email, password: creds.subject.password }),
  });
  const body = await signIn.json().catch(() => ({}));
  return { read, probe, signIn: { status: signIn.status, code: codeOf(body), challenge: Boolean(body.challengeId) } };
}

/**
 * Suspend, observe, restore. The account is restored in every outcome, and a
 * failed restore never hides the failure before it. A suspension refused with a
 * 4xx wrote nothing, so a refused restore then is no finding; any other outcome
 * may have suspended the account.
 */
async function suspendObserveRestore(ctx) {
  const { expect, setStatus, adminRole } = ctx;
  let findings = null;
  let failure = null;
  const suspended = await setStatus('suspended');
  try {
    expect(suspended.status === 200, `the platform administrator (organisation role ${adminRole}) could not suspend the subject (${suspended.status})`, suspended.json);
    findings = await whileSuspended(ctx);
  } catch (err) {
    failure = err;
  }
  const restored = await setStatus('active');
  const mayBeSuspended = !(suspended.status >= 400 && suspended.status < 500);
  const leftSuspended = mayBeSuspended && restored.status !== 200;
  const restoreFailure = `the subject could not be restored (${restored.status}); restore it before the next run`;
  if (failure) {
    if (leftSuspended) failure.message = `${failure.message}; and ${restoreFailure}`;
    throw failure;
  }
  expect(!leftSuspended, restoreFailure, restored.json);
  return { suspended, ...findings };
}

function expectRefused(expect, { read, probe, signIn }) {
  expect(read.status === 401 && codeOf(read.json) === 'ACCOUNT_INACTIVE', `a suspended account's session read projects: ${read.status} ${codeOf(read.json)}`);
  expect(
    probe.status === 401 && probe.json?.authenticated === false && codeOf(probe.json) === 'AUTH_ACCOUNT_INACTIVE',
    `the session check did not report the suspended account's session ended: ${probe.status} ${codeOf(probe.json)}`,
  );
  expect(
    signIn.status === 403 && signIn.code === 'AUTH_ACCOUNT_INACTIVE' && !signIn.challenge,
    `a suspended account's password step answered ${signIn.status} ${signIn.code}${signIn.challenge ? ' and issued a challenge' : ''}`,
  );
}

/** The newest entry the step added to the ledger for the subject: the refusal, hash-chained. */
async function expectRefusalOnLedger({ api, expect }, seen, subjectId) {
  const after = await api('GET', LEDGER);
  const added = (after.json?.data ?? []).filter((e) => e.target === `user:${subjectId}` && !seen.has(e.id));
  expect(added[0]?.event === REFUSAL, `the newest ledger entry the step added for user:${subjectId} reads ${JSON.stringify(added[0]?.event ?? null)}, not "${REFUSAL}"`, added.slice(0, 3));
  expect(Boolean(added[0]?.hash && added[0]?.prevHash), 'the refusal entry is not hash-chained', added[0]);
  return added[0];
}

/** OQ-PROJ-18's body. Its argument is the harness's step context. */
export async function accountStandingStep({ api, expect, deviation, baseUrl }) {
  const creds = identities(deviation);
  const call = caller(baseUrl);

  const before = await api('GET', LEDGER);
  expect(before.status === 200, `ledger expected 200, got ${before.status}`, before.json);
  const seen = new Set((before.json?.data ?? []).map((e) => e.id));

  const subject = await passwordLogin(baseUrl, creds.subject);
  const admin = await passwordLogin(baseUrl, creds.admin);
  const subjectId = subject.user.id;
  // Recorded, not required: a platform administrator who is not also an
  // organisation admin shows Master Administration admits the platform role
  // alone (VSR-001 F-31).
  const adminRole = organisationRole(admin);
  const openBefore = (await call(subject.accessToken, 'GET', PROJECTS)).status;
  expect(openBefore === 200, `the subject's session could not read projects before the suspension (${openBefore})`);

  const setStatus = (to) =>
    call(admin.accessToken, 'PATCH', `/api/admin/master/users/${subjectId}/status`, { status: to, reason: `OQ-PROJ-18: account standing (${to})` });
  const { suspended, read, probe, signIn } = await suspendObserveRestore({ expect, setStatus, adminRole, call, baseUrl, subject, creds });
  expectRefused(expect, { read, probe, signIn });
  const entry = await expectRefusalOnLedger({ api, expect }, seen, subjectId);

  const reopened = (await call(subject.accessToken, 'GET', PROJECTS)).status;
  expect(reopened === 200, `the restored subject's session read projects ${reopened}`);
  return (
    `subject user:${subjectId} (${subject.method}): projects ${openBefore}; suspended by the platform administrator user:${admin.user.id} ` +
    `(organisation role ${adminRole}), ${suspended.status}; its session read projects ${read.status} ${codeOf(read.json)}, session check ` +
    `${probe.status} ${codeOf(probe.json)}, password step ${signIn.status} ${signIn.code}, no challenge; newest new ledger entry ` +
    `"${entry.event}", chained; restored, the same session read projects ${reopened}`
  );
}
