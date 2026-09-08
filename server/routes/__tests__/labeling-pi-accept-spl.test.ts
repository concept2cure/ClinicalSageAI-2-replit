/**
 * POST /api/labeling-pi/:sectionNo/accept-agency-text and POST /api/labeling-pi/spl
 * — the two governed actions behind the labeling surface's negotiation panel
 * and SPL tab.
 *
 * Both existed as dead buttons before this: "Accept FDA text" was a primary
 * <button> with no handler at all, and the "SPL — submission" tab only moved a
 * highlight. What these tests hold is the part that matters once they DO
 * something:
 *
 *  · an accept without a reason for change is refused (21 CFR 11.10(e) — the
 *    audit trail records why, not only what);
 *  · an accept records BOTH sides of the change plus the reason;
 *  · an SPL is never emitted with an empty Indications/Warnings element, and
 *    never without the product identity SPL requires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const {
  upsertLabelingPiSection, listLabelingPiSections, acceptAgencyText,
  LabelingPiValidationError, LabelingPiConflictError, logAction,
} = vi.hoisted(() => {
  class LabelingPiValidationError extends Error {}
  class LabelingPiConflictError extends Error {}
  return {
    upsertLabelingPiSection: vi.fn(),
    listLabelingPiSections: vi.fn(),
    acceptAgencyText: vi.fn(),
    LabelingPiValidationError,
    LabelingPiConflictError,
    logAction: vi.fn(),
  };
});
vi.mock('../../services/labeling/labeling-pi-service', () => ({
  upsertLabelingPiSection, listLabelingPiSections, acceptAgencyText,
  LabelingPiValidationError, LabelingPiConflictError,
}));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import labelingPiRouter from '../labeling-pi.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/labeling-pi', labelingPiRouter);
  return app;
}

function section(no: string, body: string[] | null) {
  return {
    id: 'sec-' + no, organization_id: 7, section_no: no, label: 'Section ' + no,
    status: 'approved', flag: null, program: 'BX-204',
    content: body ? { heading: no + '  Section', body } : null,
    negotiation: null, created_by: 55, created_at: 'now', updated_at: 'now',
  };
}

/** All four sections SPL draws from, each with text. */
function fullSplSections() {
  return [section('1', ['Indications text']), section('2', ['Dosage text']),
    section('4', ['Contraindications text']), section('5', ['Warnings text'])];
}

beforeEach(() => {
  acceptAgencyText.mockReset();
  listLabelingPiSections.mockReset();
  logAction.mockReset();
});

describe('POST /api/labeling-pi/:sectionNo/accept-agency-text', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/labeling-pi/1/accept-agency-text').send({ reasonForChange: 'agreed at labeling teleconference' });
    expect(res.status).toBe(403);
    expect(acceptAgencyText).not.toHaveBeenCalled();
  });

  it('refuses an accept with no reason for change — the record change is never made', async () => {
    const res = await request(appWith(7)).post('/api/labeling-pi/1/accept-agency-text').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    // The point of the guard: the service is not reached, so nothing was written.
    expect(acceptAgencyText).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('refuses a reason too short to be one', async () => {
    const res = await request(appWith(7)).post('/api/labeling-pi/1/accept-agency-text').send({ reasonForChange: 'ok' });
    expect(res.status).toBe(400);
    expect(acceptAgencyText).not.toHaveBeenCalled();
  });

  it('accepts, and writes both sides of the change plus the reason into the audit trail', async () => {
    acceptAgencyText.mockResolvedValue({
      row: {
        ...section('1', ['Agency wording']),
        negotiation: { round: 'Labeling round 2', cycle: 'FDA — day 312', sponsor: 'Sponsor wording', agency: 'Agency wording', rationale: 'r' },
      },
      previousContent: { heading: '1  Section', body: ['Sponsor wording'] },
    });
    const res = await request(appWith(7)).post('/api/labeling-pi/1/accept-agency-text')
      .send({ reasonForChange: 'Adopted at the day-312 labeling teleconference' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ n: '1', st: 'approved', flag: null });
    expect(acceptAgencyText).toHaveBeenCalledWith(7, '1', { userId: 55 });

    const entry = logAction.mock.calls[0][0];
    expect(entry.action).toBe('LABELING_PI_AGENCY_TEXT_ACCEPTED');
    expect(entry.details.reasonForChange).toBe('Adopted at the day-312 labeling teleconference');
    expect(entry.details.previousContent).toEqual({ heading: '1  Section', body: ['Sponsor wording'] });
    expect(entry.details.acceptedText).toBe('Agency wording');
  });

  it('409 when the section has no agency text to accept — never approves the sponsor draft as the agency’s', async () => {
    acceptAgencyText.mockRejectedValue(new LabelingPiConflictError('Section 1 has no agency-proposed text on record, so there is nothing to accept.'));
    const res = await request(appWith(7)).post('/api/labeling-pi/1/accept-agency-text').send({ reasonForChange: 'trying to accept anyway' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOTHING_TO_ACCEPT');
    expect(logAction).not.toHaveBeenCalled();
  });

  it('404 when the section does not exist in this org', async () => {
    acceptAgencyText.mockRejectedValue(new LabelingPiConflictError('No label section 9 in this organization.'));
    const res = await request(appWith(7)).post('/api/labeling-pi/9/accept-agency-text').send({ reasonForChange: 'accepting section nine' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/labeling-pi/spl', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/labeling-pi/spl').send({ productName: 'X', manufacturer: 'Y' });
    expect(res.status).toBe(403);
  });

  it('refuses to build an SPL without the product identity it requires, and names what is missing', async () => {
    const res = await request(appWith(7)).post('/api/labeling-pi/spl').send({ productName: 'BX-204' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRODUCT_IDENTITY_REQUIRED');
    expect(res.body.error.missing).toEqual(['manufacturer', 'activeIngredients']);
    expect(listLabelingPiSections).not.toHaveBeenCalled();
  });

  it('refuses to emit an SPL whose label sections are empty, and names the empty sections', async () => {
    // §5 Warnings has no authored text — an SPL with a blank Warnings element
    // reads as a complete submission document and is not one.
    listLabelingPiSections.mockResolvedValue([
      section('1', ['Indications text']), section('2', ['Dosage text']),
      section('4', ['Contraindications text']), section('5', null),
    ]);
    const res = await request(appWith(7)).post('/api/labeling-pi/spl')
      .send({ productName: 'BX-204', manufacturer: 'Concept2Cure', activeIngredients: [{ name: 'rezatinib', strength: '50 mg' }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LABEL_SECTIONS_EMPTY');
    expect(res.body.error.emptySections).toEqual([{ uspi: '5', title: 'Warnings and precautions' }]);
  });

  it('builds the SPL from the org’s own stored label text and reports the structural check honestly', async () => {
    listLabelingPiSections.mockResolvedValue(fullSplSections());
    const res = await request(appWith(7)).post('/api/labeling-pi/spl')
      .send({
        productName: 'BX-204', manufacturer: 'Concept2Cure', ndc: '12345-678-90',
        activeIngredients: [{ name: 'rezatinib', strength: '50 mg' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.xml).toContain('BX-204');
    // The prose in the XML is the stored sections', not re-authored text.
    expect(res.body.data.xml).toContain('Indications text');
    expect(res.body.data.xml).toContain('Warnings text');
    expect(res.body.data.xml).toContain('rezatinib');
    expect(res.body.data.validation).toHaveProperty('valid');
    expect(logAction.mock.calls[0][0].action).toBe('LABELING_SPL_GENERATED');
  });
});
