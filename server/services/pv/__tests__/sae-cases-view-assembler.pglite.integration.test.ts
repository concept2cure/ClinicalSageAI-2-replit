/**
 * assembleOrgSaeCases — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: SAE cases persisted in the REAL pharmacovigilance store
 * (`adverse_events`) are assembled into the SafetyNarrative worklist shape, with the
 * 21 CFR 312.32(c)/E2A expedited-reporting clock computed live from the real facts —
 * 15-day, 7-day, and 'none' (expected) — with strict TEXT org scope, seriousness_criteria
 * parsed from JSON-in-TEXT, and trial-only fields the store lacks honestly absent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleOrgSaeCases } from '../sae-cases-view-assembler';

const ORG = 7;
const OTHER = 9;
const NOW = new Date('2026-07-10T12:00:00Z');

const DDL = `
CREATE TABLE adverse_events (
  id text PRIMARY KEY, organization_id text, project_id text, event_type text,
  patient_id text, event_description text, onset_date timestamptz, report_date timestamptz,
  seriousness_criteria text, causality text, outcome text, reporter_type text,
  expectedness text, reaction_pt text, suspect_product text, suspect_product_dose text,
  narrative text, regulatory_reporting_deadline timestamptz, created_at timestamptz DEFAULT now()
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM adverse_events;`); });

async function insertCase(org: number, o: Record<string, unknown>): Promise<void> {
  await pglite.query(
    `INSERT INTO adverse_events (id, organization_id, project_id, patient_id, event_description, report_date,
        seriousness_criteria, causality, outcome, expectedness, reaction_pt, suspect_product, suspect_product_dose)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [o.id, String(org), o.studyId, o.subjectId, o.description, o.awarenessDate,
     JSON.stringify(o.seriousnessCriteria ?? []), o.causality, o.outcome, o.expectedness,
     o.term, o.studyDrug, o.dose],
  );
}

describe('assembleOrgSaeCases', () => {
  it('maps real adverse_events into the worklist + computes the live 15-day clock', async () => {
    await insertCase(ORG, {
      id: 'ICSR-8841', studyId: 'BX204-301', subjectId: '2041-0087', studyDrug: 'BX-099', dose: '200 mg IV q3w',
      awarenessDate: '2026-07-06', expectedness: 'unexpected', term: 'immune-mediated pneumonitis',
      description: 'Grade 3 pneumonitis.', seriousnessCriteria: ['hospitalization', 'medically important'],
      causality: 'possibly related', outcome: 'recovering',
    });
    const rows = await assembleOrgSaeCases(ORG, NOW) as any[];
    expect(rows).toHaveLength(1);
    const c = rows[0];
    expect(c.id).toBe('ICSR-8841');
    expect(c.subjectId).toBe('2041-0087');
    expect(c.studyId).toBe('BX204-301');
    expect(c.studyDrug).toBe('BX-099');
    expect(c.dose).toBe('200 mg IV q3w');
    expect(c.event.term).toBe('immune-mediated pneumonitis');   // reaction_pt
    expect(c.event.seriousnessCriteria).toEqual(['hospitalization', 'medically important']); // JSON-in-TEXT parsed
    expect(c.event.causality).toBe('possibly related');
    // Serious + unexpected + suspected, not fatal/LT → 15-day; Day0=2026-07-06 → due 2026-07-21.
    expect(c.reportingCategory).toBe('15-day');
    expect(c.reportingDueDate).toBe('2026-07-21');
    expect(c.reportingDaysRemaining).toBe(11);
    expect(c.reportingOverdue).toBe(false);
    expect(c.clock).toBe('15-day expedited report');
    expect(c.due).toBe('2026-07-21');
    // Trial-only fields the store doesn't carry are honestly absent.
    expect(c.age).toBeUndefined();
    expect(c.sex).toBeUndefined();
    expect(c.treatmentArm).toBeUndefined();
    expect(c.medicalHistory).toEqual([]);
    expect(c.concomitantMeds).toEqual([]);
  });

  it('computes a 7-day clock for a life-threatening unexpected suspected SUSAR', async () => {
    await insertCase(ORG, {
      id: 'ICSR-8839', studyId: 'BX204-301', subjectId: '2041-0112', studyDrug: 'BX-099', dose: '200 mg',
      awarenessDate: '2026-07-13', expectedness: 'unexpected', term: 'infusion-related reaction',
      description: 'Life-threatening IRR.', seriousnessCriteria: ['life-threatening', 'hospitalization'],
      causality: 'related', outcome: 'recovered',
    });
    const c = (await assembleOrgSaeCases(ORG, NOW))[0] as any;
    expect(c.reportingCategory).toBe('7-day');
    expect(c.reportingDueDate).toBe('2026-07-20');   // 2026-07-13 + 7
  });

  it("yields no expedited clock for a serious but EXPECTED (listed) event", async () => {
    await insertCase(ORG, {
      id: 'ICSR-8832', studyId: 'BX204-204', subjectId: '2288-0043', studyDrug: 'BX-204', dose: '400 mg PO qd',
      awarenessDate: '2026-07-10', expectedness: 'expected', term: 'ALT elevation',
      description: 'Grade 3 ALT.', seriousnessCriteria: ['medically important'], causality: 'probably related', outcome: 'recovering',
    });
    const c = (await assembleOrgSaeCases(ORG, NOW))[0] as any;
    expect(c.reportingCategory).toBe('none');
    expect(c.reportingDueDate).toBeNull();
    expect(c.clock).toBe('No expedited clock');
  });

  it('returns [] for an org with no cases, and never crosses tenants (TEXT org scope)', async () => {
    await insertCase(ORG, {
      id: 'ICSR-1', studyId: 'S1', subjectId: 'P1', studyDrug: 'D', dose: '1', awarenessDate: '2026-07-06',
      expectedness: 'unexpected', term: 't', description: 'd', seriousnessCriteria: ['hospitalization'], causality: 'related', outcome: 'recovering',
    });
    expect(await assembleOrgSaeCases(OTHER, NOW)).toEqual([]);
  });
});
