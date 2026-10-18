/**
 * An unanswered export-control screening question is not a "no".
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * The four screening questions (publication restrictions, proprietary
 * restrictions, physical export, foreign-national involvement) were optional
 * booleans read with `=== true`, and createReviewTx stored each unanswered one
 * as `false`. So `{ jurisdiction: 'ear', classification: '1C350' }` with
 * nothing else answered came back "EAR information qualifies for the
 * Fundamental Research Exclusion — no license", the readiness gate had no
 * blocker, and determineReviewTx persisted license_required = 'no' and
 * fundamental_research_exclusion = true as the final determination.
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluateExportControl, evaluateExportReviewReadiness } from '../export-control-logic';
import { createReviewTx, determineReviewTx, ExportControlError } from '../export-control-service';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));

const ALL_NO = {
  hasPublicationRestrictions: false,
  hasProprietaryRestrictions: false,
  involvesPhysicalExport: false,
  involvesForeignNationals: false,
} as const;

describe('evaluateExportControl', () => {
  it('does not apply the FRE or clear a license on questions nobody answered', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: '1C350' });
    expect(a.freApplies).toBeNull();
    expect(a.licenseRequired).toBe('unknown');
    expect(a.findings.map((f) => f.message).join(' ')).not.toMatch(/qualifies for the Fundamental Research Exclusion/);
    expect(a.unanswered).toEqual([
      'hasPublicationRestrictions',
      'hasProprietaryRestrictions',
      'involvesPhysicalExport',
      'involvesForeignNationals',
    ]);
    expect(a.findings.some((f) => /not answered/i.test(f.message))).toBe(true);
  });

  it('does not clear an EAR99 item while foreign-national involvement is unanswered', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: 'EAR99', hasPublicationRestrictions: true });
    expect(a.licenseRequired).toBe('unknown');
  });

  it('a stated restriction still defeats the FRE without the other answers', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: '3A001', hasPublicationRestrictions: true });
    expect(a.freApplies).toBe(false);
    expect(a.licenseRequired).toBe('yes');
  });

  it('answered "no" four times, EAR information qualifies for the FRE', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: '1C350', ...ALL_NO });
    expect(a.freApplies).toBe(true);
    expect(a.licenseRequired).toBe('no');
    expect(a.unanswered).toEqual([]);
  });
});

describe('evaluateExportReviewReadiness', () => {
  it('blocks a determination until every screening question is answered, naming them', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'ear', classification: '1C350' });
    expect(r.readyToDetermine).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/publication restrictions.*proprietary.*physical export.*foreign-national/i);
  });

  it('blocks even a not-subject review whose questions were never answered', () => {
    expect(evaluateExportReviewReadiness({ jurisdiction: 'not_subject' }).readyToDetermine).toBe(false);
    expect(evaluateExportReviewReadiness({ jurisdiction: 'not_subject', ...ALL_NO }).readyToDetermine).toBe(true);
  });
});

function fakeClient(row?: Record<string, unknown>) {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (text: string) => {
      sql.push(text);
      if (/^INSERT INTO export_control_reviews/.test(text.trim())) return { rows: [{ id: 12 }] };
      if (/^SELECT \* FROM export_control_reviews/.test(text.trim())) return { rows: row ? [row] : [] };
      return { rows: [] };
    }),
  };
}

describe('export-control-service', () => {
  it('refuses to open a review with unanswered screening questions instead of storing them as "no"', async () => {
    const client = fakeClient();
    await expect(
      createReviewTx(client, 7, 5, { projectTitle: 'Assay transfer', jurisdiction: 'ear', classification: '1C350', involvesForeignNationals: false }),
    ).rejects.toMatchObject({
      code: 'BAD_INPUT',
      message: expect.stringMatching(/hasPublicationRestrictions.*hasProprietaryRestrictions.*involvesPhysicalExport/),
    });
    expect(client.sql.some((s) => /INSERT/.test(s))).toBe(false);
  });

  it('opens a review whose four questions are answered', async () => {
    const client = fakeClient();
    await expect(createReviewTx(client, 7, 5, { projectTitle: 'Assay transfer', ...ALL_NO })).resolves.toEqual({ id: 12 });
  });

  it('will not determine a stored review whose answers are absent (NULL)', async () => {
    const client = fakeClient({
      id: 12, status: 'under_review', jurisdiction: 'ear', classification: '1C350', foreign_countries: null,
      has_publication_restrictions: null, has_proprietary_restrictions: null, involves_physical_export: null, involves_foreign_nationals: null,
    });
    const attempt = determineReviewTx(client, 7, 5, 12);
    await expect(attempt).rejects.toBeInstanceOf(ExportControlError);
    await expect(determineReviewTx(client, 7, 5, 12)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(client.sql.some((s) => /status = 'determined'/.test(s))).toBe(false);
  });
});
