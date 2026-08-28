/**
 * eCTD v4.0 (HL7 RPS) engine — message serialization, forward-compat mapping,
 * validation, and lifecycle references. These lock the v4.0 contracts that the
 * qualification harness and the API depend on.
 */

import { describe, it, expect } from 'vitest';
import {
  buildRpsMessage,
  validateRpsMessage,
  forwardCompatToV4,
  mapOperation,
  submissionUnitId,
  contextOfUseId,
  documentId,
  isUuid,
  type RpsMessageInput,
} from '../index';
import os from 'node:os';
import path from 'node:path';
import { packageRpsSubmission } from '../rps-packager';
import { FDA_REGIONAL_IG_OID } from '../../controlled-vocab';
import type { EctdLeaf } from '../../../submission-gateways/regional-packager';

const appNo = '123456';
const seq = '0001';

function sampleMessage(): RpsMessageInput {
  const docA = documentId(appNo, '1.2|cover.pdf');
  const couA = contextOfUseId(appNo, 'us_1.2', '1.2|cover.pdf|0001');
  return {
    submissionUnit: {
      id: submissionUnitId(appNo, seq),
      unitTypeCode: 'us_submission_unit_type_1', // Original
      title: 'Original NDA submission',
      sequenceNumber: seq,
      status: 'active',
    },
    submission: { typeCode: 'us_submission_type_1' }, // Original Application
    application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' }, // NDA
    contextsOfUse: [
      {
        id: couA,
        code: 'us_1.2',
        codeSystem: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6',
        title: 'Cover letter',
        priorityNumber: 1,
        status: 'active',
        documentId: docA,
      },
    ],
    documents: [
      {
        id: docA,
        title: 'Cover letter',
        href: '1-2/cover.pdf',
        mediaType: 'application/pdf',
        checksum: 'a'.repeat(64),
        checksumType: 'SHA256',
      },
    ],
    creationTime: '20260730120000',
  };
}

describe('RPS message builder', () => {
  it('emits a well-structured submissionUnit.xml with the FDA Regional IG OID', () => {
    const xml = buildRpsMessage(sampleMessage());
    expect(xml).toContain('<PORP_IN000001UV xmlns="urn:hl7-org:rps"');
    expect(xml).toContain(`<interactionId root="${FDA_REGIONAL_IG_OID}"`);
    expect(xml).toContain('<submissionUnit>');
    expect(xml).toContain('<code code="us_submission_unit_type_1" codeSystem="2.16.840.1.113883.3.989.5.1.2.2.1.13.2"/>');
    expect(xml).toContain('<sequenceNumber value="0001"/>');
    expect(xml).toContain('<contextOfUse>');
    expect(xml).toContain('<priorityNumber value="1"/>');
    expect(xml).toContain('<application>');
    // application id uses the CDER Application Id OID
    expect(xml).toContain('2.16.840.1.113883.3.989.5.1.2.2.1.16.1');
  });

  it('is deterministic given the same input', () => {
    expect(buildRpsMessage(sampleMessage())).toBe(buildRpsMessage(sampleMessage()));
  });

  it('escapes XML metacharacters in titles', () => {
    const m = sampleMessage();
    m.submissionUnit.title = 'A & B <tag> "q"';
    expect(buildRpsMessage(m)).toContain('A &amp; B &lt;tag&gt; &quot;q&quot;');
  });

  it('derives stable UUIDs', () => {
    expect(isUuid(submissionUnitId(appNo, seq))).toBe(true);
    expect(submissionUnitId(appNo, seq)).toBe(submissionUnitId(appNo, seq));
    expect(submissionUnitId(appNo, seq)).not.toBe(submissionUnitId(appNo, '0002'));
  });
});

describe('RPS validator', () => {
  it('passes a well-formed message', () => {
    const r = validateRpsMessage(sampleMessage(), '0001');
    expect(r.valid).toBe(true);
    expect(r.errorCount).toBe(0);
  });

  it('flags a non-UUID submissionUnit id', () => {
    const m = sampleMessage();
    m.submissionUnit.id = 'not-a-uuid';
    const r = validateRpsMessage(m, '0001');
    expect(r.valid).toBe(false);
    expect(r.findings.some((x) => x.code === 'RPS-SU-ID-UUID')).toBe(true);
  });

  it('flags an invalid submission-unit-type code', () => {
    const m = sampleMessage();
    m.submissionUnit.unitTypeCode = 'us_submission_unit_type_999';
    expect(validateRpsMessage(m).findings.some((x) => x.code === 'RPS-SU-CODE-VALID')).toBe(true);
  });

  it('flags a non-whole priorityNumber and a folder/sequence mismatch', () => {
    const m = sampleMessage();
    m.contextsOfUse[0].priorityNumber = 1.5;
    const r = validateRpsMessage(m, '0002');
    expect(r.findings.some((x) => x.code === 'RPS-COU-PRIORITY')).toBe(true);
    expect(r.findings.some((x) => x.code === 'RPS-SU-SEQ-FOLDER')).toBe(true);
  });

  it('flags a documentReference that resolves to nothing', () => {
    const m = sampleMessage();
    m.contextsOfUse[0].documentId = documentId(appNo, 'missing');
    expect(validateRpsMessage(m).findings.some((x) => x.code === 'RPS-COU-DOCREF')).toBe(true);
  });

  it('flags a dangling relatedContextOfUse against the cumulative CoU set', () => {
    const m = sampleMessage();
    m.contextsOfUse[0].relatedContextOfUseId = contextOfUseId(appNo, 'us_1.2', 'ghost|0000');
    // With a cumulative set that does not contain the referenced CoU, it is dangling.
    expect(validateRpsMessage(m, undefined, new Set()).findings.some((x) => x.code === 'RPS-COU-RELATED')).toBe(true);
    // Without the cumulative set, a valid-UUID cross-sequence ref is accepted.
    expect(validateRpsMessage(m).valid).toBe(true);
  });

  it('rejects a submissionUnit title over 128 characters', () => {
    const m = sampleMessage();
    m.submissionUnit.title = 'x'.repeat(129);
    expect(validateRpsMessage(m).findings.some((x) => x.code === 'RPS-SU-TITLE-LEN')).toBe(true);
  });

  it('flags a context-of-use code that is not in the CL2 list (presence alone is not enough)', () => {
    const m = sampleMessage();
    // Syntactically fine, but not a catalogued context-of-use section.
    m.contextsOfUse[0].code = 'us_9.99_not_a_section';
    const r = validateRpsMessage(m);
    expect(r.findings.some((x) => x.code === 'RPS-COU-CODE-VALID')).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('flags a keyword with no code', () => {
    const m = sampleMessage();
    m.contextsOfUse[0].keywords = [
      { code: '', codeSystem: '2.16.840.1.113883.3.989.5.1.2.2.1.3' },
    ];
    expect(
      validateRpsMessage(m).findings.some((x) => x.code === 'RPS-KEYWORD-CODE-REQUIRED'),
    ).toBe(true);
  });
});

describe('v3.2.2 → v4.0 forward compatibility', () => {
  const leaf = (over: Partial<EctdLeaf> & { ctdSection: string; fileName: string; operation: EctdLeaf['operation'] }): EctdLeaf => ({
    sourcePath: `/tmp/${over.fileName}`,
    title: over.fileName,
    ...over,
  });

  it('maps lifecycle operations to RPS operation codes', () => {
    expect(mapOperation('new')).toBe('create');
    expect(mapOperation('replace')).toBe('revise');
    expect(mapOperation('append')).toBe('append');
    expect(mapOperation('delete')).toBe('remove');
  });

  it('converts leaves into CoUs + reusable documents and validates clean', () => {
    const { message, notes } = forwardCompatToV4({
      application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' },
      submission: { typeCode: 'us_submission_type_1' },
      submissionUnit: {
        id: submissionUnitId(appNo, seq),
        unitTypeCode: 'us_submission_unit_type_1',
        title: 'Original',
        sequenceNumber: seq,
        status: 'active',
      },
      leaves: [
        leaf({ ctdSection: '1.2', fileName: 'cover.pdf', operation: 'new' }),
        leaf({ ctdSection: '3.2.p.1', fileName: 'desc.pdf', operation: 'new' }),
      ],
    });
    expect(message.contextsOfUse.length).toBe(2);
    expect(message.documents.length).toBe(2);
    // Module 1 → FDA CL2 code; Module 3 → ICH-governed code (with a note)
    expect(message.contextsOfUse[0].code).toBe('us_1.2');
    expect(message.contextsOfUse[1].code.startsWith('ich_')).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
    expect(validateRpsMessage(message, seq).valid).toBe(true);
  });

  it('does NOT fabricate a document integrity hash from metadata when none is supplied', () => {
    const { message, notes } = forwardCompatToV4({
      application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' },
      submission: { typeCode: 'us_submission_type_1' },
      submissionUnit: {
        id: submissionUnitId(appNo, seq),
        unitTypeCode: 'us_submission_unit_type_1',
        title: 'Original',
        sequenceNumber: seq,
        status: 'active',
      },
      leaves: [leaf({ ctdSection: '1.2', fileName: 'cover.pdf', operation: 'new' })],
      // no sha256ByPath
    });
    // The integrity check is EMPTY (honestly "not computed"), never a 64-hex
    // metadata hash that would masquerade as a real content hash.
    expect(message.documents[0].checksum).toBe('');
    expect(message.documents[0].checksum).not.toMatch(/^[0-9a-f]{64}$/);
    expect(notes.some((n) => /not computed|not a filing-ready/i.test(n))).toBe(true);
  });

  it('uses the real per-leaf SHA-256 when one is supplied', () => {
    const realSha = 'b'.repeat(64);
    const { message } = forwardCompatToV4({
      application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' },
      submission: { typeCode: 'us_submission_type_1' },
      submissionUnit: {
        id: submissionUnitId(appNo, seq),
        unitTypeCode: 'us_submission_unit_type_1',
        title: 'Original',
        sequenceNumber: seq,
        status: 'active',
      },
      leaves: [leaf({ ctdSection: '1.2', fileName: 'cover.pdf', operation: 'new' })],
      sha256ByPath: { '/tmp/cover.pdf': realSha },
    });
    expect(message.documents[0].checksum).toBe(realSha);
  });

  it('refuses to package a zero-byte source as a leaf (fail closed)', async () => {
    const m = sampleMessage();
    // A truthy-but-empty buffer used to sail through the `!raw` check.
    const sources = new Map<string, Buffer>([[m.documents[0].id, Buffer.alloc(0)]]);
    await expect(
      // outputDir is required by RpsPackagerInput and was missing here. It is a
      // scratch path on purpose: the zero-byte source must be refused BEFORE
      // anything is written, so a run that leaves this directory behind would
      // itself be the bug.
      packageRpsSubmission({
        message: m,
        sources,
        creationTime: '20260101000000',
        outputDir: path.join(os.tmpdir(), 'rps-zero-byte-refusal'),
      }),
    ).rejects.toThrow(/empty|0 bytes/i);
  });

  it('sets relatedContextOfUse for a replace against a prior sequence', () => {
    const { message } = forwardCompatToV4({
      application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' },
      submission: { typeCode: 'us_submission_type_2' },
      submissionUnit: {
        id: submissionUnitId(appNo, '0002'),
        unitTypeCode: 'us_submission_unit_type_4', // Amendment
        title: 'Amendment',
        sequenceNumber: '0002',
        status: 'active',
      },
      leaves: [leaf({ ctdSection: '1.2', fileName: 'cover.pdf', operation: 'replace' })],
      priorSequenceNumber: '0001',
    });
    const cou = message.contextsOfUse[0];
    expect(cou.operation).toBe('revise');
    expect(cou.relatedContextOfUseId).toBe(contextOfUseId(appNo, 'us_1.2', '1.2|cover.pdf|0001'));
    // The document is REUSED: same id as the 0001 sequence would derive.
    expect(cou.documentId).toBe(documentId(appNo, '1.2|cover.pdf'));
  });
});
