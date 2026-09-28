/**
 * The dossier consistency check does not say "clean" when nothing was
 * compared (row 74, track H).
 *
 * checkDossierConsistency compares the labelled figures of a draft with the
 * same labels in the project's other documents. Before this change, every
 * path that compared nothing still returned verdict 'clean', and
 * check_dossier_consistency told the model "No consistency issues detected
 * against the existing dossier":
 *   - a project id that is not a positive number,
 *   - a draft under 100 characters,
 *   - a draft with no labelled figures and no CTD section,
 *   - a project with no other documents,
 *   - figures that no other document states under the same label.
 * In a regulated dossier that is a false negative presented as a finding.
 *
 * Now each of those reports verdict 'not_assessed' with the reason, and the
 * tool's copy says nothing was compared and why. 'clean' needs at least one
 * labelled figure compared with the same label in another document, and a
 * divergence found is still reported whatever else was not compared.
 *
 * Review follow-through (the blocks marked "review [n]"): a saved copy of the
 * draft is the draft, not another document; references that resolved are
 * reported; the tool refuses a project id that names no project; and the
 * verdicts and reasons are one list in shared/ana/dossier-consistency.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({ fail: false, rows: [] as unknown[], reads: 0 }));

vi.mock('../../../db.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      dbState.reads += 1;
      if (dbState.fail) throw new Error('connection terminated unexpectedly');
      return dbState.rows;
    },
  };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import { checkDossierConsistency } from '../cross-artifact-consistency';
import { CHECK_DOSSIER_CONSISTENCY } from '../../ana/document-intake-tool-defs';

// Three labelled figures: sample_size 240, dose_kg 50, noael 50.
const DRAFT =
  'In the pivotal study the sample size was N = 240 subjects, randomized 1:1. ' +
  'The NOAEL of 50 mg/kg/day was set in the 28-day rat study, and the primary endpoint was met.';
const NO_FIGURES =
  'The applicant describes the overall development programme and the rationale for the ' +
  'proposed indication, in narrative form only, without figures.';
const NO_FIGURES_WITH_XREF =
  'The applicant describes the overall development programme in narrative form; the pivotal ' +
  'efficacy data are presented in Module 5.3.5 of this application.';

const artifact = (id: number, content: string, ctdSection: string | null = '5.3.5.1') => ({
  id,
  artifactId: `art-${id}`,
  title: `Document ${id}`,
  content,
  ctdSection,
  status: 'draft',
});
const AGREES = artifact(
  1,
  'Clinical study report. The sample size was N = 240 subjects across 32 sites. ' +
    'The NOAEL of 50 mg/kg/day was established in the 28-day rat toxicology study.',
);
const DISAGREES = artifact(
  2,
  'Clinical study report. The sample size was N = 312 subjects across 32 sites. ' +
    'The NOAEL of 50 mg/kg/day was established in the 28-day rat toxicology study.',
);
// A figure the draft does not state (shelf life): nothing to compare it with.
const SHARES_NOTHING = artifact(
  3,
  'Stability summary. The data support a 24-month shelf-life for the tablets stored in HDPE ' +
    'bottles with desiccant at 25 C.',
  '3.2.P.8.1',
);

beforeEach(() => {
  dbState.fail = false;
  dbState.rows = [];
  dbState.reads = 0;
});

const check = (over: Partial<Parameters<typeof checkDossierConsistency>[0]> = {}) =>
  checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT, ...over });

describe('checkDossierConsistency: an early return compares nothing and says so', () => {
  it.each([
    ['a project id of 0', { projectId: 0 }, 'no_project'],
    ['a project id that is not a number', { projectId: Number.NaN }, 'no_project'],
    ['a project id that is not an integer', { projectId: 1.5 }, 'no_project'],
    ['a draft under 100 characters', { draftContent: 'N = 240 subjects.' }, 'draft_too_short'],
    ['a draft with no labelled figures and no CTD section', { draftContent: NO_FIGURES }, 'no_figures_in_draft'],
  ] as const)('%s is not_assessed (%s), never clean, and reads nothing', async (_name, over, reason) => {
    dbState.rows = [AGREES];
    const report = await check(over);
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe(reason);
    expect(report.artifactsCompared).toBe(0);
    expect(report.figuresCompared).toBe(0);
    expect(dbState.reads).toBe(0);
  });
});

describe('checkDossierConsistency: a read that leaves nothing to compare', () => {
  it('a project with no other documents is not_assessed (no_related_artifacts), never clean', async () => {
    const report = await check();
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_related_artifacts');
    expect(report.artifactsCompared).toBe(0);
    expect(report.draftFactsExtracted).toBe(3);
    expect(report.unavailable).toBeUndefined();
  });

  it('a draft with a CTD section but no labelled figures is not_assessed (no_figures_in_draft)', async () => {
    dbState.rows = [AGREES];
    const report = await check({ draftContent: NO_FIGURES, draftCtdSection: '2.5' });
    expect(dbState.reads).toBe(1);
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_figures_in_draft');
    expect(report.artifactsCompared).toBe(1);
    expect(report.draftFactsExtracted).toBe(0);
  });

  it('figures that no other document states under the same label are not_assessed (no_shared_figures)', async () => {
    dbState.rows = [SHARES_NOTHING];
    const report = await check();
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_shared_figures');
    expect(report.artifactsCompared).toBe(1);
    expect(report.draftFactsExtracted).toBe(3);
    expect(report.figuresCompared).toBe(0);
  });

  it('an unreadable project is not clean either (the S3 error path keeps its marker)', async () => {
    dbState.fail = true;
    const report = await check();
    expect(report.unavailable).toBe('artifacts_unreadable');
    expect(report.verdict).not.toBe('clean');
  });
});

describe('checkDossierConsistency: a real comparison keeps its verdict', () => {
  it('figures compared with the same labels, none differing, is still clean', async () => {
    dbState.rows = [AGREES];
    const report = await check();
    expect(report.verdict).toBe('clean');
    expect(report.notAssessedReason).toBeUndefined();
    expect(report.artifactsCompared).toBe(1);
    expect(report.figuresCompared).toBe(3);
    expect(report.divergences).toEqual([]);
  });

  it('a figure that differs is still flagged, even beside a document that shares nothing', async () => {
    dbState.rows = [SHARES_NOTHING, DISAGREES];
    const report = await check();
    expect(report.verdict).toBe('blocker');
    expect(report.notAssessedReason).toBeUndefined();
    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toMatchObject({
      kind: 'numeric_divergence',
      severity: 'critical',
      draftValue: '240',
      existingValue: '312',
    });
  });

  it('a missing cross-reference is still flagged when no figure was compared', async () => {
    dbState.rows = [SHARES_NOTHING];
    const report = await check({ draftContent: NO_FIGURES_WITH_XREF, draftCtdSection: '2.5' });
    expect(report.verdict).toBe('minor_issues');
    expect(report.notAssessedReason).toBeUndefined();
    expect(report.figuresCompared).toBe(0);
    expect(report.crossReferencesChecked).toBe(1);
    expect(report.divergences.map(d => d.kind)).toEqual(['missing_cross_reference']);
  });
});

const runTool = async (input: Record<string, unknown>) => {
  const { getToolHandler } = await import('../../ana/AnaToolExecutor');
  return JSON.parse(await getToolHandler('check_dossier_consistency')!(input, { organizationId: 7, userId: 3 } as any));
};

describe('the check_dossier_consistency tool', () => {
  // A project id of 0 is an input error at the tool, not a verdict: see the
  // review follow-through below. The engine keeps 'no_project' for direct callers.
  it.each([
    ['a draft under 100 characters', { draft_content: 'N = 240 subjects.', project_id: 12 }, [AGREES], 'draft_too_short'],
    ['a draft with no labelled figures', { draft_content: NO_FIGURES, project_id: 12 }, [AGREES], 'no_figures_in_draft'],
    ['a project with no other documents', { draft_content: DRAFT, project_id: 12 }, [], 'no_related_artifacts'],
    ['figures no other document shares', { draft_content: DRAFT, project_id: 12 }, [SHARES_NOTHING], 'no_shared_figures'],
  ] as const)('%s: verdict not_assessed with the reason, and copy that says nothing was compared', async (_n, input, rows, reason) => {
    dbState.rows = [...rows];
    const out = await runTool(input);
    expect(out.verdict).toBe('not_assessed');
    expect(out.notAssessedReason).toBe(reason);
    expect(out.figuresCompared).toBe(0);
    expect(out.recommendation).toMatch(/not assessed/i);
    expect(out.recommendation).toMatch(/not a clean result/i);
    expect(JSON.stringify(out)).not.toMatch(/No consistency issues/);
    expect(out).not.toHaveProperty('error');
  }, 30_000);

  it('a real comparison with no difference is clean, and its copy counts what was compared', async () => {
    dbState.rows = [AGREES];
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.verdict).toBe('clean');
    expect(out).not.toHaveProperty('notAssessedReason');
    expect(out.figuresCompared).toBe(3);
    expect(out.recommendation).toMatch(/\b3 labelled-figure comparisons\b/);
    expect(out.recommendation).toMatch(/not compared/);
  }, 30_000);

  it('a disagreement is still a blocker with the divergence', async () => {
    dbState.rows = [DISAGREES];
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.verdict).toBe('blocker');
    expect(out.divergenceCount).toBe(1);
    expect(out.bySeverity.critical).toBe(1);
  }, 30_000);
});

describe('the check_dossier_consistency definition', () => {
  it('names not_assessed among the verdicts the model can receive', () => {
    expect(CHECK_DOSSIER_CONSISTENCY.description).toMatch(/not_assessed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review follow-through (row 74, track H, 2026-09-28)
// ─────────────────────────────────────────────────────────────────────────────

// The draft as the project already holds it: a saved copy, found because the
// caller gave no exclude_artifact_id (the S5 harness gives none).
const DRAFT_COPY = artifact(9, DRAFT, '2.5');

describe('review [1]: a saved copy of the draft is the draft, not another document', () => {
  it('a project whose only document is the draft itself is not_assessed (only_draft_copies), never clean', async () => {
    dbState.rows = [DRAFT_COPY];
    const report = await check();
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('only_draft_copies');
    expect(report.artifactsCompared).toBe(0);
    expect(report.draftCopiesSetAside).toBe(1);
    expect(report.figuresCompared).toBe(0);
  });

  it('a copy that differs only in whitespace and line endings is the draft too', async () => {
    const reflowed = `\n  ${DRAFT.replace(/\. /g, '.\r\n').replace(/ /g, '  ')}  \n`;
    dbState.rows = [artifact(9, reflowed)];
    const report = await check();
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('only_draft_copies');
    expect(report.draftCopiesSetAside).toBe(1);
  });

  it('beside a document that agrees, only that document is counted and compared', async () => {
    dbState.rows = [DRAFT_COPY, AGREES];
    const report = await check();
    expect(report.verdict).toBe('clean');
    expect(report.artifactsCompared).toBe(1);
    expect(report.figuresCompared).toBe(3);
    expect(report.draftCopiesSetAside).toBe(1);
  });

  it('beside a document that disagrees, the divergence is still a blocker', async () => {
    dbState.rows = [DRAFT_COPY, DISAGREES];
    const report = await check();
    expect(report.verdict).toBe('blocker');
    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toMatchObject({ existingArtifactId: 'art-2', draftValue: '240', existingValue: '312' });
  });

  it('a document that holds the draft and more is another document, and is compared', async () => {
    dbState.rows = [artifact(10, `${DRAFT} The listings follow in the appendix.`)];
    const report = await check();
    expect(report.verdict).toBe('clean');
    expect(report.artifactsCompared).toBe(1);
    expect(report.figuresCompared).toBe(3);
    expect(report.draftCopiesSetAside).toBe(0);
  });

  it("a reference that only the draft's own copy covers is neither flagged nor counted as checked", async () => {
    const selfReferring = `${DRAFT} This summary is Module 2.5 of the application.`;
    dbState.rows = [artifact(9, selfReferring, '2.5'), AGREES];
    const report = await check({ draftContent: selfReferring });
    expect(report.divergences).toEqual([]);
    expect(report.crossReferencesChecked).toBe(0);
    expect(report.figuresCompared).toBe(3);
    expect(report.verdict).toBe('clean');
  });

  it('the tool: the draft alone is not_assessed, and the copy names the draft, not "other" documents', async () => {
    dbState.rows = [DRAFT_COPY];
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.verdict).toBe('not_assessed');
    expect(out.notAssessedReason).toBe('only_draft_copies');
    expect(out.draftCopiesSetAside).toBe(1);
    expect(out.recommendation).toMatch(/draft's own text/);
    expect(out.recommendation).toMatch(/not a clean result/);
    expect(JSON.stringify(out)).not.toMatch(/No consistency issues/);
  }, 30_000);

  it('the tool: clean beside the copy counts one other document and says the copy was set aside', async () => {
    dbState.rows = [DRAFT_COPY, AGREES];
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.verdict).toBe('clean');
    expect(out.artifactsCompared).toBe(1);
    expect(out.recommendation).toMatch(/\b1 other project document read\b/);
    expect(out.recommendation).toMatch(/\b1 project document with the draft's own text was set aside\b/);
  }, 30_000);
});

// A document the draft's "Module 5.3.5" reference resolves to. It states no
// labelled figure, so nothing but the reference can be checked against it.
const XREF_TARGET = artifact(
  4,
  'Clinical study reports for the pivotal efficacy study, with the listings and patient narratives.',
  '5.3.5.1',
);

describe('review [3]/[7]: cross-references that resolved are reported, not denied', () => {
  it('no figures, one reference resolved: not_assessed (no_figures_in_draft), with the reference counted', async () => {
    dbState.rows = [XREF_TARGET];
    const report = await check({ draftContent: NO_FIGURES_WITH_XREF, draftCtdSection: '2.5' });
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_figures_in_draft');
    expect(report.crossReferencesChecked).toBe(1);
    expect(report.divergences).toEqual([]);
  });

  it('the tool copy states the resolved reference and limits "not assessed" to the figures', async () => {
    dbState.rows = [XREF_TARGET];
    const out = await runTool({ draft_content: NO_FIGURES_WITH_XREF, project_id: 12, ctd_section: '2.5' });
    expect(out.verdict).toBe('not_assessed');
    expect(out.crossReferencesChecked).toBe(1);
    expect(out.recommendation).toMatch(/\b1 cross-reference resolved against the other project documents\b/);
    expect(out.recommendation).toMatch(/figure consistency was not assessed/i);
    expect(out.recommendation).toMatch(/not a clean result/);
    expect(out.recommendation).not.toMatch(/(^|\. )Consistency was not assessed/);
  }, 30_000);

  it('with no reference checked, the copy still says consistency was not assessed', async () => {
    dbState.rows = [AGREES];
    const out = await runTool({ draft_content: NO_FIGURES, project_id: 12, ctd_section: '2.5' });
    expect(out.crossReferencesChecked).toBe(0);
    expect(out.recommendation).toMatch(/(^|\. )Consistency was not assessed; this is not a clean result\.$/);
    expect(out.recommendation).not.toMatch(/cross-reference/);
  }, 30_000);
});

describe('review [4]: the tool asks for a valid project instead of answering', () => {
  it.each([0, -3, 1.5, null, '0'])('project_id %s is an input error, with no verdict, and nothing is read', async projectId => {
    dbState.rows = [AGREES];
    const out = await runTool({ draft_content: DRAFT, project_id: projectId });
    expect(out.error).toMatch(/positive integer project_id/);
    expect(out).not.toHaveProperty('verdict');
    expect(dbState.reads).toBe(0);
  }, 30_000);

  it('a positive integer project id sent as a string still runs the check', async () => {
    dbState.rows = [AGREES];
    const out = await runTool({ draft_content: DRAFT, project_id: '12' });
    expect(out).not.toHaveProperty('error');
    expect(out.verdict).toBe('clean');
  }, 30_000);

  it('the engine keeps no_project for a direct caller', async () => {
    const report = await check({ projectId: -3 });
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_project');
  });
});

describe('review [6]: one result vocabulary, in shared/, for the server and any client reader', () => {
  it('lists every verdict, and every not-assessed reason has its own copy', async () => {
    const shared = await import('../../../../shared/ana/dossier-consistency');
    const { recommendationFor } = await import('../consistency-verdict');
    expect(shared.DOSSIER_CONSISTENCY_VERDICTS).toEqual(['clean', 'minor_issues', 'needs_review', 'blocker', 'not_assessed']);
    const copies = shared.DOSSIER_NOT_ASSESSED_REASONS.map(notAssessedReason =>
      recommendationFor({
        verdict: 'not_assessed',
        notAssessedReason,
        artifactsCompared: 0,
        figuresCompared: 0,
        crossReferencesChecked: 0,
        draftCopiesSetAside: 0,
      }),
    );
    for (const copy of copies) {
      expect(copy).not.toMatch(/^Nothing was compared\./);
      expect(copy).toMatch(/not a clean result/);
    }
    expect(new Set(copies).size).toBe(shared.DOSSIER_NOT_ASSESSED_REASONS.length);
    expect(shared.DOSSIER_NOT_ASSESSED_REASONS).toContain('only_draft_copies');
  });

  it('every verdict the engine returns in this file is in the shared list', async () => {
    const { DOSSIER_CONSISTENCY_VERDICTS } = await import('../../../../shared/ana/dossier-consistency');
    const cases: Array<[unknown[], Partial<Parameters<typeof checkDossierConsistency>[0]>]> = [
      [[AGREES], {}],
      [[DISAGREES], {}],
      [[SHARES_NOTHING], { draftContent: NO_FIGURES_WITH_XREF, draftCtdSection: '2.5' }],
      [[DRAFT_COPY], {}],
      [[], { projectId: 0 }],
    ];
    for (const [rows, over] of cases) {
      dbState.rows = rows;
      const { verdict } = await check(over);
      expect(DOSSIER_CONSISTENCY_VERDICTS).toContain(verdict);
    }
  });
});
