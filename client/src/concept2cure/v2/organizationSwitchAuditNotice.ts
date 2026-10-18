import {
  AUDIT_ROW_NOT_PERSISTED_CODE,
  AUDIT_ROW_NOT_RETRIEVABLE_CODE,
  findUnpersistedAuditRow,
  type AuditRowNotPersistedDetail,
} from '@/lib/queryClient';

const NOTICE_KEY = 'c2c.organization-switch-audit-notice';
const SWITCH_PATH = '/api/auth/enterprise/select-organization';

function noticeOf(value: unknown): AuditRowNotPersistedDetail | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.method !== 'POST' || row.path !== SWITCH_PATH ||
      (row.code !== AUDIT_ROW_NOT_PERSISTED_CODE && row.code !== AUDIT_ROW_NOT_RETRIEVABLE_CODE)) return null;
  const correlationId = typeof row.correlationId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(row.correlationId)
    ? row.correlationId : undefined;
  return { method: 'POST', path: SWITCH_PATH, code: row.code, ...(correlationId ? { correlationId } : {}) };
}

/** Carry only this completed switch's canonical warning through its reload.
 * Never serialize the response, token, actor, organization or driver detail. */
export function rememberOrganizationSwitchAuditNotice(headers: Headers, body: unknown): void {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
    const outcome = findUnpersistedAuditRow(headers, body);
    if (!outcome) return;
    const notice = noticeOf({ method: 'POST', path: SWITCH_PATH, code: outcome.code,
      correlationId: headers.get('X-Request-Id') });
    if (notice) sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
  } catch { /* Restricted storage must not break an already-rotated session. */ }
}

/** Remove before parsing: malformed or already-consumed notices never replay. */
export function consumeOrganizationSwitchAuditNotice(): AuditRowNotPersistedDetail | null {
  try {
    const raw = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return raw && raw.length <= 512 ? noticeOf(JSON.parse(raw)) : null;
  } catch { return null; }
}
