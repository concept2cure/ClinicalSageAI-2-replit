/**
 * Where AnA already talks about a post-filing obligation, it cites the
 * regulation that creates it (D2, 2026-10-05,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-post-filing-citation-facts-facts.md).
 *
 * Defects these assertions were written against:
 *   - The Advisory Committee briefing-book flow cited 21 CFR 314.81(b)(1) for
 *     the 120-day safety update, in its guidance, its issue message and its
 *     reference. 314.81(b)(1) is the NDA field alert report. The safety update
 *     is required by 314.50(d)(5)(vi)(b): 4 months after the initial
 *     submission, in a resubmission after a complete response letter, and when
 *     FDA asks.
 *   - The NDA flow said the iPSP is due "60 days after the EOP2 meeting
 *     request" and attributed the requirement to FDARA 2017. FD&C Act
 *     505B(e), added by FDASIA 2012, sets it at no later than 60 calendar days
 *     after the end-of-phase 2 meeting.
 *   - ana-ri's FDA information-request response template cited "21 CFR
 *     314.100–314.110 (review timelines)" and "FDA Complete Response Letter
 *     Guidance" — neither governs a reply to an IR — and claimed 510(k) on the
 *     same basis. A reply to an IR on a pending NDA is an amendment under
 *     21 CFR 314.60.
 */
import { describe, it, expect } from 'vitest';
import { createBriefingBookFlow } from '../../server/services/ana/intelligence-questions/flows/briefing-book';
import { createNdaSubmissionFlow } from '../../server/services/ana/intelligence-questions/flows/nda-submission';
import {
  DOCUMENT_TEMPLATES,
  detectDocumentTemplate,
} from '../../server/services/ana-ri/document-templates';

const node = (flow: ReturnType<typeof createBriefingBookFlow>, id: string) => {
  const n = flow.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node ${id} missing`);
  return n;
};

describe('briefing book: the 120-day safety update cites 314.50(d)(5)(vi)(b)', () => {
  const flow = createBriefingBookFlow();
  const update = node(flow, 'safety_update');

  it('no text in the flow cites the field-alert paragraph 314.81(b)(1)', () => {
    expect(JSON.stringify(flow)).not.toContain('314.81(b)(1)');
  });

  it('the guidance cites 314.50(d)(5)(vi)(b) and names its three filing points', () => {
    expect(update.guidance).toContain('21 CFR 314.50(d)(5)(vi)(b)');
    expect(update.guidance).toMatch(/4 months after the initial submission/i);
    expect(update.guidance).toMatch(/resubmission (?:following|after) (?:receipt of )?a complete response letter/i);
    expect(update.guidance).toMatch(/when(?:ever)? FDA (?:asks|requests)/i);
  });

  it('keeps the regulation\'s waiver qualifier on the case report forms', () => {
    expect(update.guidance).toMatch(/case report forms[^.]*unless FDA waives/i);
  });

  it('the guidance does not present the BLA safety update as the NDA regulation', () => {
    // 314.50 is an NDA rule; for a BLA the update is practice, and says so.
    expect(update.guidance).not.toMatch(/after the NDA\/BLA submission and before the Advisory Committee meeting/);
    expect(update.guidance).toMatch(/BLA[^.]*(?:practice|not in 21 CFR 314)/i);
  });

  it('the missing-update issue cites 314.50(d)(5)(vi)(b) in its message and reference', () => {
    const issue = update.issueChecks?.find((c) => c.id === 'missing_safety_update');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('21 CFR 314.50(d)(5)(vi)(b)');
    expect(issue!.reference).toContain('21 CFR 314.50(d)(5)(vi)(b)');
  });
});

describe('NDA flow: the iPSP is due 60 calendar days after the EOP2 meeting, under 505B(e)', () => {
  const flow = createNdaSubmissionFlow();
  const ped = node(flow, 'pediatric_commitments');
  const text = JSON.stringify(ped);
  const ipsp = ped.fields?.find((f) => f.id === 'ipsp_submitted');
  const issue = ped.issueChecks?.find((c) => c.id === 'ipsp_not_submitted');

  it('never ties the deadline to the meeting request', () => {
    expect(JSON.stringify(flow)).not.toMatch(/EOP2 meeting request/i);
  });

  it('states 60 calendar days after the end-of-phase 2 meeting in guidance, help and issue', () => {
    const due = /60 calendar days after the end-of-phase 2 \(EOP2\) meeting/i;
    expect(ped.guidance).toMatch(due);
    expect(ipsp?.helpText).toMatch(due);
    expect(issue?.message).toMatch(due);
  });

  it('attributes the requirement to FD&C Act 505B(e) (FDASIA 2012), not FDARA 2017', () => {
    expect(text).not.toMatch(/Per FDARA 2017, the iPSP/);
    expect(text).not.toMatch(/as amended by FDARA 2017\), sponsors of new drugs must submit an initial Pediatric Study Plan/);
    expect(ped.guidance).toMatch(/505B\(e\)/);
    expect(issue?.reference).toMatch(/505B\(e\)/);
  });

  it('gives the 210-day agreement cycle as FDA 90, sponsor 90, FDA 30', () => {
    expect(ipsp?.helpText).toMatch(/90 days/);
    expect(ipsp?.helpText).toMatch(/30 days/);
    expect(ipsp?.helpText).toMatch(/210 days/);
  });

  it('does not say orphan designation exempts every drug from PREA', () => {
    expect(ped.guidance).not.toMatch(/Orphan-designated drugs are exempt from PREA\./);
    expect(ped.guidance).toMatch(/molecular target/i);
  });

  it('limits the RACE for Children Act exception to an original application for a new active ingredient', () => {
    // 505B(a)(1)(B) (FDARA 2017 s.504): original NDA or BLA for a new active
    // ingredient submitted on or after 2020-08-18, not every adult-cancer drug.
    expect(ped.guidance).toMatch(/original application for a new active ingredient \(NDA or BLA\) submitted on or after 2020-08-18/i);
  });
});

describe('ana-ri IR response template cites 314.60 and claims no device scope', () => {
  const t = DOCUMENT_TEMPLATES.fda_information_request_response;

  it('cites 21 CFR 314.60 and drops the review-timeline and CRL-guidance citations', () => {
    const refs = (t.regulatoryReferences ?? []).join(' | ');
    expect(refs).toContain('21 CFR 314.60');
    expect(refs).not.toContain('314.100');
    expect(refs).not.toContain('Complete Response Letter Guidance');
    expect(refs).not.toMatch(/MAPP for review staff/);
  });

  it('keeps FDA\'s option under 314.60(b)(1) to defer a late major amendment to the next cycle', () => {
    const refs = (t.regulatoryReferences ?? []).join(' | ');
    expect(refs).toMatch(/FDA may instead defer review of the amendment to the next cycle/);
  });

  it('no longer claims 510(k) under the drug amendment basis', () => {
    expect(t.submissionFamily).not.toMatch(/510\(k\)/);
    expect(JSON.stringify(t.sections)).not.toMatch(/510\(k\)/);
  });

  it('says a 510(k) additional-information request is out of its scope', () => {
    expect(t.draftingInstructions).toMatch(/510\(k\)[^.]*not (?:covered|this template)/i);
  });

  it('is still what an IR-response request routes to', () => {
    expect(detectDocumentTemplate('draft an fda information request response')?.template.id).toBe(
      'fda_information_request_response',
    );
  });
});
