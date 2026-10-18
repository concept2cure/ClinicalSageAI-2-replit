import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ESTAR_FIELD_MAPS, getEstarFieldMapCapability } from '../estar-field-map';
import { fillEstarSubmission } from '../estar-fill';
import { assessEstarFilingReadiness } from '../estar-filing-readiness';
import { listXfaFields, listXfaPackets, readXfaDatasetsValues } from '../../../forms/fill-official-pdf';
import { listEstarAttachmentSlots } from '../estar-attachment-slots';

const DATA = { applicantCompanyName: 'ZZPRESTAR Applicant', applicantContactEmail: 'applicant@example.invalid', correspondentCompanyName: 'ZZPRESTAR Correspondent', correspondentContactEmail: 'correspondent@example.invalid' };
let template: Buffer, pdf: Buffer;
beforeAll(async () => {
  template = await readFile('assets/estar-templates/PreSTAR-q-sub.pdf');
  expect(createHash('sha256').update(template).digest('hex')).toBe('3f134a223897312d965c5d4b05f3d68f4cad2ed6593b419fd6565124a61b58c3');
  const doc = await PDFDocument.create(); doc.addPage(); pdf = Buffer.from(await doc.save());
});

describe('actual pinned PreSTAR 3.1 administrative preparation', () => {
  it.each(['q_sub', 'ide', '513g'] as const)('writes four measured administrative fields for %s without selecting the request or altering the official template', async type => {
    const result = await fillEstarSubmission({ type, variant: 'prestar', data: DATA });
    expect(result.filled, result.blockers.join(' ')).toBe(true);
    expect(result.filledFields.sort()).toEqual(Object.keys(DATA).sort());
    expect(result.fieldMapCapability).toEqual({ scope: 'administrative-prefill', requestSpecificAutomation: 'not-qualified', applicantCompletionRequired: true });
    expect(result.warnings.join(' ')).toMatch(/complete its questions and declarations/);
    const output = Buffer.from(result.pdfBytes!);
    expect(output.subarray(0, template.length).equals(template)).toBe(true);
    const paths = [...Object.values(ESTAR_FIELD_MAPS[`${type}-prestar`]).map(spec => spec.xfaSomPath!), 'root.ApplicationType.USA.ATDropDownList104'];
    const values = await readXfaDatasetsValues(output, paths);
    for (const [key, value] of Object.entries(DATA)) expect(values[ESTAR_FIELD_MAPS[`${type}-prestar`][key].xfaSomPath!]).toBe(value);
    const originalValues = await readXfaDatasetsValues(template, paths);
    expect(values['root.ApplicationType.USA.ATDropDownList104']).toBe(originalValues['root.ApplicationType.USA.ATDropDownList104']);
    const originalPackets = await listXfaPackets(template), outputPackets = await listXfaPackets(output);
    for (const packet of originalPackets.filter(p => p.name !== 'datasets')) expect(Buffer.from(outputPackets.find(p => p.name === packet.name)!.bytes).equals(Buffer.from(packet.bytes))).toBe(true);
  });

  it('maps only direct declared data-bound cells whose template scripts do not assign their values', async () => {
    const fields = await listXfaFields(template), packets = await listXfaPackets(template);
    const xml = Buffer.from(packets.find(p => p.name === 'template')!.bytes).toString('utf8');
    const scripts = [...xml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)].map(m => m[1]).join('\n');
    for (const [key, spec] of Object.entries(ESTAR_FIELD_MAPS['q_sub-prestar'])) {
      expect(fields.find(f => f.somPath === spec.xfaSomPath)).toMatchObject({ inDatasets: true, caption: spec.caption });
      const fieldName = spec.xfaSomPath!.split('.').at(-1)!;
      expect(scripts).not.toMatch(new RegExp(`\\b${fieldName}\\.rawValue\\s*=(?!=)`));
      expect(['applicantCompanyName','applicantContactEmail','correspondentCompanyName','correspondentContactEmail']).toContain(key);
    }
    expect(Object.keys(ESTAR_FIELD_MAPS['q_sub-prestar'])).toHaveLength(4);
    expect(xml).toMatch(/name="AdministrativeInformation"[^>]*presence="hidden"/);
    expect(xml).toMatch(/name="Questions"[^>]*presence="hidden"/);
  });

  it('keeps filing blocked even when registration, substantive content, current template and administrative mapping are complete', () => {
    const leaves = ['Cover letter', 'Applicant contact and administrative information', 'Device description and intended use', 'Specific questions for FDA', 'Background and our position'].map((title,index) => ({ sectionCode: String(index+1), title, substantive: true }));
    const result = assessEstarFilingReadiness({ catalogKey: 'qsub_pre_submission', variant: 'device', registration: { clientId: 'offline-org', satisfied: ['fda_esg_account','cdrh_portal_account','organization_identity','mdufa_fee_account'] }, leaves, templateAvailable: true, fieldMapPopulated: true, vendoredTemplateVersion: '3.1', asOf: '2026-10-14' })!;
    expect(result).toMatchObject({ eligible: true, contentReady: true, officialTemplateProducible: true, templateVersionCurrent: true, requestSpecificAutomationQualified: false, canFileNow: false });
    expect(result.blockers.join(' ')).toMatch(/Request-specific form behavior and attachment routing are not qualified/);
    expect(getEstarFieldMapCapability('ide-prestar').applicantCompletionRequired).toBe(true);
  });

  it('embeds the exact cover letter under its measured chapter and preserves independently readable dynamic XFA', async () => {
    const slots = await listEstarAttachmentSlots(template);
    expect(slots.find(s => s.somPath === 'root.CoverLetter.CLAddAttachment110')).toMatchObject({ chapters: ['/CHAPTER 1/CH1.01/'], singleAttachment: 'Only a single cover letter is needed.' });
    const result = await fillEstarSubmission({ type: 'q_sub', variant: 'prestar', data: DATA,
      attachments: [{ slot: 'root.CoverLetter.CLAddAttachment110', source: { kind: 'vault_document', documentId: 'a0000000-0000-4000-8000-000000000001' } }],
      attachmentResolver: async () => ({ ok: true, bytes: pdf, fileName: 'Cover Letter.pdf', mimeType: 'application/pdf' }),
      attachmentClock: new Date('2026-10-14T00:00:00Z'),
    });
    expect(result.filled, result.blockers.join(' ')).toBe(true);
    expect(result.attachmentReport?.attached).toHaveLength(1);
    const values = await readXfaDatasetsValues(result.pdfBytes!, ['root.AttachmentManifest']);
    expect(values['root.AttachmentManifest']).toMatch(/^\*\*\*Begin\*\*\*<<.*\|\/CHAPTER 1\/CH1\.01\/>>$/);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(result.pdfBytes!), enableXfa: true, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
    try {
      expect(document.isPureXfa).toBe(true);
      const attachments = await document.getAttachments();
      expect(Object.values(attachments ?? {})).toHaveLength(1);
      const retained = Object.values(attachments ?? {})[0];
      if (!retained || typeof retained !== 'object' || !('content' in retained) || !(retained.content instanceof Uint8Array)) throw new Error('Independent PDF reader did not expose the retained attachment bytes.');
      expect(Buffer.from(retained.content).equals(pdf)).toBe(true);
      const trees: string[] = [];
      for (let page = 1; page <= document.numPages; page++) trees.push(JSON.stringify(await (await document.getPage(page)).getXfa()));
      // Independent pdf.js does not execute the applicant's XFA change scripts;
      // hidden administrative fields therefore must not be claimed rendered.
      expect(trees.join('\n')).not.toContain(DATA.applicantCompanyName);
      expect(document.numPages).toBeGreaterThan(0);
    } finally { await document.destroy(); }
  }, 30_000);
});
