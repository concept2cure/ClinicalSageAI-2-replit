/**
 * Assemble the v2 CroPortfolio surface's `CroSponsor` render contract from the REAL,
 * org-scoped CRO engagement store — cro_clients + cro_studies +
 * cro_regulatory_submissions + cro_milestones + cro_team_assignments
 * (migrations/0000_sweet_joseph.sql) — the exact tables the /api/cro CRUD routes
 * (server/routes/cro.ts) write, NOT the seed-only c2c_cro_portfolio blob.
 *
 * The surface renders one row per sponsor client ({ id, name, type, lead, sow,
 * sowNote, studies[], subs[] }); every field maps from a real column or a
 * deterministic rollup over real child rows:
 *
 *   id / name / type      cro_clients.id / name / company_type
 *   lead                  users.name via the client's active cro_team_assignments row
 *                         (client-level first, then primary, then earliest start);
 *                         honest null when nobody is assigned
 *   sow                   derived from real contract facts: a non-'active'
 *                         contract_status passes through verbatim; an active contract
 *                         ending within 60 days is 'renewal-due'; an active contract
 *                         at risk_level 'high' is 'at-risk'; else 'on-track'
 *   sowNote               cro_clients.notes (honest null)
 *   studies[]             cro_studies — code/phase/ind from study_number/study_phase/
 *                         indication; status is the store's coarse vocabulary
 *                         normalized to the surface's display labels; n is
 *                         current_enrollment / target_enrollment formatted
 *   subs[]                cro_regulatory_submissions — id/type/region from
 *                         submission_number/submission_type/regulatory_region; state
 *                         is submission_status normalized onto the Submission Center
 *                         5-state lifecycle; due is expected_approval_date as
 *                         'Mon YYYY' (honest null); gate is a live rollup over the
 *                         submission's cro_milestones (open count / 'gate clear' /
 *                         null when none are tracked)
 *
 * Children are fetched in bulk (one query per table via ANY($ids)), all org-scoped
 * with INTEGER organization_id. The cro_* tables carry no deleted_at (hard-delete
 * store — DELETE /api/cro/clients/:id removes rows), so there is no soft-delete
 * filter to apply. An org with no clients returns [] and the surface renders its
 * honest empty state.
 */
import { pool } from '../../db';

const MAX_CLIENTS = 50;

const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => {
  const s = str(v).trim();
  return s === '' ? null : s;
};

/** cro_studies.study_status (coarse store vocabulary, free text) → the surface's
 *  display labels. The surface treats anything ≠ 'Complete' as an active study and
 *  tones 'Complete' / 'Startup' specially, so those two normalizations are the
 *  load-bearing ones; unknown values are humanized verbatim, never invented. */
const STUDY_STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  startup: 'Startup',
  recruiting: 'Enrolling',
  enrolling: 'Enrolling',
  active: 'Enrolling',
  ongoing: 'Ongoing',
  data_lock: 'Data lock',
  locked: 'Data lock',
  completed: 'Complete',
  complete: 'Complete',
  closed: 'Complete',
};

/** cro_regulatory_submissions.submission_status → the Submission Center 5-state
 *  lifecycle keys the surface renders (draft → assembling → validated → frozen →
 *  dispatched). The store's post-filing vocabulary ('submitted', 'under_review',
 *  'approved') is past the dispatch gate, so it lands on 'dispatched'; unknown
 *  values pass through lowercase (the surface falls back to its first state). */
const SUB_STATE: Record<string, string> = {
  draft: 'draft',
  assembling: 'assembling',
  validated: 'validated',
  frozen: 'frozen',
  dispatched: 'dispatched',
  submitted: 'dispatched',
  under_review: 'dispatched',
  approved: 'dispatched',
};

function humanize(raw: string): string {
  const s = raw.replace(/_/g, ' ').trim();
  return s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function studyStatusLabel(raw: unknown): string {
  const s = str(raw).toLowerCase();
  return STUDY_STATUS_LABEL[s] ?? humanize(str(raw));
}

function subState(raw: unknown): string {
  const s = str(raw).toLowerCase();
  return SUB_STATE[s] ?? s;
}

const fmtCount = (n: number): string => n.toLocaleString('en-US');

/** 'current / target' enrollment display; '—' when enrollment isn't tracked
 *  (no target and nothing enrolled — e.g. an analytical-validation study). */
function enrollmentDisplay(current: unknown, target: unknown): string {
  const cur = current == null ? null : Number(current);
  const tgt = target == null ? null : Number(target);
  if (tgt == null && (cur == null || cur === 0)) return '—';
  return `${fmtCount(cur ?? 0)} / ${tgt != null ? fmtCount(tgt) : '—'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A timestamp reduced to its 'Mon YYYY' target label (UTC), or null. */
function monthYear(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const RENEWAL_WINDOW_MS = 60 * 86_400_000;

/** SOW / engagement status derived from the real contract facts (see header). */
function sowStatus(contractStatus: unknown, riskLevel: unknown, contractEndDate: unknown, now: Date): string {
  const status = str(contractStatus).toLowerCase() || 'active';
  if (status !== 'active') return status;
  if (contractEndDate != null) {
    const end = contractEndDate instanceof Date ? contractEndDate : new Date(String(contractEndDate));
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime() + RENEWAL_WINDOW_MS) {
      return 'renewal-due';
    }
  }
  if (str(riskLevel).toLowerCase() === 'high') return 'at-risk';
  return 'on-track';
}

/** Milestone gate rollup for one submission: null when no gates are tracked,
 *  'gate clear' when every tracked milestone is closed, else the open count. */
function gateRollup(statuses: string[]): string | null {
  if (statuses.length === 0) return null;
  const open = statuses.filter((s) => {
    const v = s.toLowerCase();
    return v !== 'completed' && v !== 'complete' && v !== 'cancelled';
  }).length;
  if (open === 0) return 'gate clear';
  return open === 1 ? '1 gate open' : `${open} gates open`;
}

function groupBy<T>(rows: T[], key: (r: T) => unknown): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = str(key(r));
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

/**
 * Assemble the org's sponsor-client portfolio, oldest engagement first (insertion
 * order — the stable roster order). Returns [] when the org has no clients — the
 * surface renders its honest empty state.
 */
export async function assembleOrgCroPortfolio(
  orgId: number,
  now: Date = new Date(),
): Promise<Record<string, unknown>[]> {
  const clientsRes = await pool.query(
    `SELECT id, name, company_type, contract_status, risk_level, contract_end_date, notes
       FROM cro_clients
      WHERE organization_id = $1
      ORDER BY id
      LIMIT $2`,
    [orgId, MAX_CLIENTS],
  );
  const clients = clientsRes.rows as Array<Record<string, unknown>>;
  if (clients.length === 0) return [];
  const clientIds = clients.map((c) => Number(c.id));

  const [studiesRes, subsRes, leadsRes] = await Promise.all([
    pool.query(
      `SELECT id, client_id, study_number, study_phase, indication, study_status,
              current_enrollment, target_enrollment
         FROM cro_studies
        WHERE client_id = ANY($1) AND organization_id = $2
        ORDER BY id`,
      [clientIds, orgId],
    ),
    pool.query(
      `SELECT id, client_id, submission_number, submission_type, regulatory_region,
              submission_status, expected_approval_date
         FROM cro_regulatory_submissions
        WHERE client_id = ANY($1) AND organization_id = $2
        ORDER BY id`,
      [clientIds, orgId],
    ),
    // The engagement lead of record: the client's active assignment, preferring a
    // client-level row over study/submission-level, then 'primary', then earliest.
    pool.query(
      `SELECT ta.client_id, u.name
         FROM cro_team_assignments ta
         JOIN users u ON u.id = ta.user_id
        WHERE ta.client_id = ANY($1) AND ta.organization_id = $2 AND ta.status = 'active'
        ORDER BY (ta.study_id IS NULL AND ta.submission_id IS NULL) DESC,
                 (ta.assignment_type = 'primary') DESC,
                 ta.start_date ASC, ta.id ASC`,
      [clientIds, orgId],
    ),
  ]);

  const subs = subsRes.rows as Array<Record<string, unknown>>;
  const subIds = subs.map((s) => Number(s.id));
  const milestonesRes = subIds.length
    ? await pool.query(
        `SELECT submission_id, status
           FROM cro_milestones
          WHERE submission_id = ANY($1) AND organization_id = $2`,
        [subIds, orgId],
      )
    : { rows: [] as Array<Record<string, unknown>> };

  const studiesByClient = groupBy(studiesRes.rows as Array<Record<string, unknown>>, (r) => r.client_id);
  const subsByClient = groupBy(subs, (r) => r.client_id);
  const milestonesBySub = groupBy(milestonesRes.rows as Array<Record<string, unknown>>, (r) => r.submission_id);

  const leadByClient = new Map<string, string>();
  for (const r of leadsRes.rows as Array<{ client_id: unknown; name: unknown }>) {
    const k = str(r.client_id);
    if (!leadByClient.has(k)) leadByClient.set(k, str(r.name));
  }

  return clients.map((c) => {
    const id = Number(c.id);
    return {
      id: str(id),
      name: str(c.name),
      type: str(c.company_type),
      lead: leadByClient.get(str(id)) ?? null,
      sow: sowStatus(c.contract_status, c.risk_level, c.contract_end_date, now),
      sowNote: strOrNull(c.notes),
      studies: (studiesByClient.get(str(id)) ?? []).map((s) => ({
        code: str(s.study_number),
        phase: strOrNull(s.study_phase),
        ind: str(s.indication),
        status: studyStatusLabel(s.study_status),
        n: enrollmentDisplay(s.current_enrollment, s.target_enrollment),
      })),
      subs: (subsByClient.get(str(id)) ?? []).map((s) => {
        const subId = Number(s.id);
        return {
          // submission_number is the real identifier; fall back to a stable code
          // from the row's PK rather than fabricating one.
          id: strOrNull(s.submission_number) ?? `SUB-${subId}`,
          type: str(s.submission_type),
          region: str(s.regulatory_region),
          state: subState(s.submission_status),
          gate: gateRollup((milestonesBySub.get(str(subId)) ?? []).map((m) => str(m.status))),
          due: monthYear(s.expected_approval_date),
        };
      }),
    };
  });
}
