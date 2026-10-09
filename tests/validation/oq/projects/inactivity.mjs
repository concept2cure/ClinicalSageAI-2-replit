/**
 * OQ-PROJ-19 — a session left alone ends (URS-PROJ-013; plan P1-1).
 *
 * The idle window is the organisation's `sessionTimeoutMinutes`, fixed into a
 * session at sign-in (15 minutes when unset), so the step sets a one-minute
 * window with the run session (an organisation administrator), opens a session
 * of its own, leaves it alone for 65 seconds, and expects the API, the refresh
 * and the session check to refuse it with SESSION_IDLE while the run's own
 * session, in use, keeps reading. The setting is restored in every outcome.
 */
import { devLogin, passwordLogin, runCredential } from '../../lib/harness.mjs';

export const INACTIVITY_TEXT = {
  title: 'A session left alone ends',
  action:
    'With the run session (an organisation administrator): GET /api/tenant-config/:orgId/settings, then PATCH it with security.sessionTimeoutMinutes = 1. Open a session of the step\'s own (password and authenticator code on a credentialed run; dev-login on a development run) and GET /api/c2c/projects with it. Leave it alone for 65 seconds. With the same session: GET /api/c2c/projects; POST /api/auth/refresh with its refresh token; GET /api/auth/session. Restore sessionTimeoutMinutes to its previous value (15 when it was unset). The run session reads projects throughout',
  expected:
    'Settings 200 and the PATCH 200. The step\'s own session reads projects 200 at first. After 65 seconds idle: projects 401 SESSION_IDLE; the refresh 401 SESSION_IDLE with no new tokens; the session check authenticated=false. The run session, in use, still reads projects 200. The setting is restored',
  note: 'Until P1-1 (2026-09-26) a 24-hour token opened the API whether or not anyone was at the keyboard, and a refresh renewed it (security audit 2026-09-24, IAM-06). The idle window is the organisation\'s sessionTimeoutMinutes, fixed into the session at sign-in (15 minutes when unset), so the step sets a one-minute window before opening its own session and restores the setting after. A run identity that is not an organisation administrator cannot set it, and the step is then not executed.',
};

const PROJECTS = '/api/c2c/projects';
const IDLE_MS = 65_000;
const NOT_ADMIN = 'not executed — the run identity is not an organisation administrator';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A caller for the step's own session: status, body and the error code the server named. */
function callerFor(baseUrl, token) {
  const headers = { Authorization: `Bearer ${token}`, Origin: baseUrl, 'Content-Type': 'application/json' };
  return async (method, route, body) => {
    const r = await fetch(`${baseUrl}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, json, code: json?.error?.code ?? json?.code ?? null };
  };
}

/** Read the organisation's window and return a setter for it; a non-administrator is a deviation. */
async function windowOf({ api, expect, deviation }, orgId) {
  const route = `/api/tenant-config/${orgId}/settings`;
  const settings = await api('GET', route);
  if (settings.status === 403) deviation(`${NOT_ADMIN} (tenant settings answered 403)`);
  expect(settings.status === 200, `tenant settings expected 200, got ${settings.status}`, settings.json);
  const setWindow = (minutes) => api('PATCH', route, { security: { sessionTimeoutMinutes: minutes } });
  return { previous: settings.json?.security?.sessionTimeoutMinutes, setWindow };
}

async function ownSession(baseUrl) {
  const credential = runCredential();
  return credential ? passwordLogin(baseUrl, credential) : devLogin(baseUrl);
}

/** What the idle session is answered: the API, the refresh, the session check. */
async function afterIdle(baseUrl, own, call) {
  const after = await call('GET', PROJECTS);
  const refresh = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ refreshToken: own.refreshToken }),
  });
  const refreshBody = await refresh.json().catch(() => ({}));
  const probe = await call('GET', '/api/auth/session');
  return { after, refresh: { status: refresh.status, code: refreshBody?.error?.code ?? null, minted: Boolean(refreshBody?.accessToken) }, probe };
}

function assertRefused({ expect }, { after, refresh, probe, runStillReads }) {
  expect(after.status === 401 && after.code === 'SESSION_IDLE', `after 65 s idle the session still read projects (${after.status} ${after.code})`);
  expect(refresh.status === 401 && refresh.code === 'SESSION_IDLE' && !refresh.minted, `the idle session refreshed (${refresh.status} ${refresh.code ?? ''})`);
  expect(probe.json?.authenticated !== true, 'the session check still reports the idle session signed in', probe.json);
  expect(runStillReads.status === 200, `the run session, in use, stopped reading projects (${runStillReads.status})`);
}

export async function inactivityStep(ctx) {
  const { api, expect, deviation, auth, baseUrl } = ctx;
  const { previous, setWindow } = await windowOf({ api, expect, deviation }, auth.user.organizationId);
  const shortened = await setWindow(1);
  if (shortened.status === 403) deviation(`${NOT_ADMIN} (the settings PATCH answered 403)`);
  expect(shortened.status === 200, `setting a one-minute window answered ${shortened.status}`, shortened.json);
  try {
    const own = await ownSession(baseUrl);
    const call = callerFor(baseUrl, own.accessToken);
    const before = await call('GET', PROJECTS);
    expect(before.status === 200, `the step's own session could not read projects (${before.status})`);
    await sleep(IDLE_MS);
    const runStillReads = await api('GET', PROJECTS);
    const outcome = await afterIdle(baseUrl, own, call);
    assertRefused({ expect }, { ...outcome, runStillReads });
    const signedOut = outcome.probe.json?.authenticated === true ? 'signed in' : 'signed out';
    return `own session (${own.method}): projects ${before.status}; after 65 s idle ${outcome.after.status} ${outcome.after.code}; refresh ${outcome.refresh.status} ${outcome.refresh.code ?? ''}; session check ${signedOut}; run session ${runStillReads.status}; window restored to ${previous ?? 15} min`;
  } finally {
    await setWindow(previous ?? 15);
  }
}
