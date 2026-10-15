/**
 * A Notified Body file goes to the Notified Body, not to EMA's CESP (2026-10-15).
 *
 * submissionChannelFor sent every EU entry whose agency is not 'EMA' to the EU
 * region default, so the 22 registry entries with agency 'Notified_Body' (EU MDR /
 * IVDR technical documentation, CER, SSCP, Notified Body opinion and consultation,
 * …) resolved to the ema:cesp gateway: getSubmittability reported them
 * `submittable`, and channelSupportFor described them as going through "the EMA
 * gateway". CESP is the medicines-dossier channel for national, MRP and DCP
 * procedures; a Notified Body file goes to the Notified Body that assesses it, and
 * the platform models no Notified Body's channel, so none is claimed.
 */
import { describe, it, expect } from 'vitest';
import { GLOBAL_REGISTRY } from '../../../../../shared/regulatory/global-document-registry';
import { submissionChannelFor, getSubmittability } from '../submittabilityCoverage';
import { channelSupportFor } from '../../market-support';
import { cespChannelRefusal } from '../../../submission-gateways/ema-cesp';

const NB_ENTRIES = GLOBAL_REGISTRY.filter((e) => e.agency === 'Notified_Body');

describe('Notified Body files', () => {
  it('the premise: the registry holds Notified Body filings', () => {
    expect(NB_ENTRIES.map((e) => e.id)).toEqual(expect.arrayContaining(['EU_MDR_TECHDOC', 'EU_IVDR', 'EU_CER']));
  });

  it.each(NB_ENTRIES.map((e) => [e.id, e] as const))('%s names the Notified Body, channel not modelled — not ema:cesp', (_id, entry) => {
    const ch = submissionChannelFor(entry);
    expect(ch, 'a Notified Body file was routed to a gateway').toMatchObject({ kind: 'unconnected' });
    if (ch.kind !== 'unconnected') return;
    expect(ch.channel).toMatch(/Notified Body/);
    expect(ch.channel).toMatch(/not modelled/);
    expect(ch.channel).not.toMatch(/CESP/i);
  });

  it.each(NB_ENTRIES.map((e) => [e.id, e] as const))('%s is never reported submittable', (_id, entry) => {
    const s = getSubmittability(entry);
    expect(s.tier).toBe('no_gateway');
    expect(String(s.channel ?? '')).toMatch(/Notified Body/);
  });

  it('channelSupportFor does not describe the EMA gateway for a Notified Body file', () => {
    const judged = channelSupportFor(NB_ENTRIES.find((e) => e.id === 'EU_MDR_TECHDOC')!);
    expect(judged.state).toBe('applicant_uploads');
    expect(judged.channel).toMatch(/Notified Body/);
    expect(judged.detail).not.toMatch(/EMA gateway is connected/);
  });

  it('the CESP adapter refuses a Notified Body file, naming where it goes', () => {
    const entry = NB_ENTRIES.find((e) => e.id === 'EU_IVDR')!;
    const refusal = cespChannelRefusal(entry, submissionChannelFor(entry));
    expect(refusal).toMatch(/Notified Body/);
  });
});
