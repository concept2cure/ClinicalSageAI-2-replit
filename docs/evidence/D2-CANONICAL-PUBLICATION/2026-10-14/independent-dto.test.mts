import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalSourceAdmissionReceiptV2,
  fingerprintSourceAdmissionReceiptV2,
  SourceAdmissionReceiptValidationError,
  validateSourceAdmissionReceiptV2,
} from '../../../../shared/ana/source-admission-receipts';

// Frozen expectations: DTO_EXPECTATIONS.md. No owner test fixture is imported.
const CANONICAL_REFERENCE = '{"actorId":42,"admittedRole":"viewer","checkpoint":"host_budget_admitted","documentId":"cccccccc-cccc-cccc-cccc-cccccccccccc","extractionSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","organizationId":17,"originalSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","payloadSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","programId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","ranges":[{"end":9,"sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","start":4}],"receiptId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","threadId":null,"toolUseId":"tool-7","totalChars":12,"version":2}';

function fixture() {
  return {
    version: 2,
    receiptId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    checkpoint: 'host_budget_admitted',
    organizationId: 17,
    actorId: 42,
    admittedRole: '  VIEWER  ',
    programId: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    documentId: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
    originalSha256: 'A'.repeat(64),
    extractionSha256: 'B'.repeat(64),
    totalChars: 12,
    ranges: [{ start: 4, end: 9, sha256: 'D'.repeat(64) }],
    payloadSha256: 'C'.repeat(64),
    toolUseId: 'tool-7' as string | null,
    threadId: null as string | null,
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function refused(input: unknown): SourceAdmissionReceiptValidationError {
  try {
    validateSourceAdmissionReceiptV2(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SourceAdmissionReceiptValidationError);
    const controlled = error as SourceAdmissionReceiptValidationError;
    expect(controlled.code).toBe('INVALID_SOURCE_ADMISSION_RECEIPT');
    expect(controlled.message).toBe('Source admission receipt is invalid.');
    return controlled;
  }
  throw new Error('Expected a controlled descriptor refusal.');
}

describe('independent exact-source admission descriptor controls', () => {
  it('matches a literal canonical descriptor without acceptance time or source content', () => {
    const canonical = canonicalSourceAdmissionReceiptV2(fixture());
    expect(canonical).toBe(CANONICAL_REFERENCE);
    const parsed = JSON.parse(canonical);
    expect(Object.keys(parsed)).toEqual([
      'actorId', 'admittedRole', 'checkpoint', 'documentId', 'extractionSha256',
      'organizationId', 'originalSha256', 'payloadSha256', 'programId', 'ranges',
      'receiptId', 'threadId', 'toolUseId', 'totalChars', 'version',
    ]);
  });

  it('makes key order and null prototypes canonical-equivalent to the literal reference', async () => {
    const reversed = Object.fromEntries(Object.entries(fixture()).reverse());
    const nullPrototype = Object.assign(Object.create(null), reversed);
    expect(canonicalSourceAdmissionReceiptV2(reversed)).toBe(CANONICAL_REFERENCE);
    expect(canonicalSourceAdmissionReceiptV2(nullPrototype)).toBe(CANONICAL_REFERENCE);
    expect(await fingerprintSourceAdmissionReceiptV2(nullPrototype)).toBe(sha256(CANONICAL_REFERENCE));
  });

  it('binds each immutable source, actor, range, payload and serving identity including receipt ID', async () => {
    const baseline = sha256(CANONICAL_REFERENCE);
    const changes: Array<(value: ReturnType<typeof fixture>) => void> = [
      value => { value.receiptId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; },
      value => { value.organizationId++; },
      value => { value.actorId++; },
      value => { value.admittedRole = 'custom-reader'; },
      value => { value.programId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; },
      value => { value.documentId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; },
      value => { value.originalSha256 = 'e'.repeat(64); },
      value => { value.extractionSha256 = 'e'.repeat(64); },
      value => { value.totalChars++; },
      value => { value.ranges[0].start++; },
      value => { value.ranges[0].end++; },
      value => { value.ranges[0].sha256 = 'e'.repeat(64); },
      value => { value.payloadSha256 = 'e'.repeat(64); },
      value => { value.toolUseId = 'tool-8'; },
      value => { value.threadId = 'thread-8'; },
    ];
    for (const change of changes) {
      const input = fixture();
      change(input);
      expect(await fingerprintSourceAdmissionReceiptV2(input)).not.toBe(baseline);
    }
    const equivalent = fixture();
    equivalent.receiptId = equivalent.receiptId.toLowerCase();
    equivalent.originalSha256 = equivalent.originalSha256.toLowerCase();
    equivalent.admittedRole = 'viewer';
    expect(await fingerprintSourceAdmissionReceiptV2(equivalent)).toBe(baseline);
  });

  it('returns deeply frozen private copies while leaving the caller mutable', () => {
    const input = fixture();
    const validated = validateSourceAdmissionReceiptV2(input);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.ranges)).toBe(true);
    expect(Object.isFrozen(validated.ranges[0])).toBe(true);
    expect(validated).not.toBe(input);
    expect(validated.ranges).not.toBe(input.ranges);
    expect(validated.ranges[0]).not.toBe(input.ranges[0]);
    expect(Object.isFrozen(input)).toBe(false);
    input.actorId = 99;
    input.ranges[0].start = 5;
    input.ranges.push({ start: 10, end: 12, sha256: 'e'.repeat(64) });
    expect(validated.actorId).toBe(42);
    expect(validated.ranges).toEqual([{ start: 4, end: 9, sha256: 'd'.repeat(64) }]);
    expect(() => Object.defineProperty(validated, 'actorId', { value: 99 })).toThrow(TypeError);
  });

  it('takes the private canonical UTF-8 snapshot before the digest awaits', async () => {
    let captured: Uint8Array | undefined;
    let finish!: (value: ArrayBuffer) => void;
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation((_algorithm, data) => {
      captured = Uint8Array.from(data as Uint8Array);
      return new Promise<ArrayBuffer>(resolve => { finish = resolve; });
    });
    try {
      const input = fixture();
      const pending = fingerprintSourceAdmissionReceiptV2(input);
      expect(new TextDecoder().decode(captured)).toBe(CANONICAL_REFERENCE);
      input.receiptId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      input.actorId = 999;
      input.ranges[0].start = 5;
      input.ranges[0].sha256 = 'e'.repeat(64);
      input.threadId = 'changed-while-awaiting';
      finish(Uint8Array.from(Buffer.from(sha256(captured!), 'hex')).buffer);
      expect(await pending).toBe(sha256(CANONICAL_REFERENCE));
      expect(new TextDecoder().decode(captured)).toBe(CANONICAL_REFERENCE);
    } finally {
      digest.mockRestore();
    }
  });

  it('preserves one to eight disjoint and adjacent ranges including a late window', () => {
    expect(validateSourceAdmissionReceiptV2(fixture()).ranges).toHaveLength(1);
    const input = fixture();
    input.totalChars = 10_000_000;
    input.ranges = [[0, 1], [1, 2], [42, 43], [1_000, 1_004], [20_000, 20_003],
      [100_000, 100_008], [1_000_000, 1_000_007], [9_999_990, 10_000_000]]
      .map(([start, end], index) => ({ start, end, sha256: String(index).repeat(64) }));
    const actual = validateSourceAdmissionReceiptV2(input);
    expect(actual.ranges).toHaveLength(8);
    expect(actual.ranges.map(({ start, end }) => [start, end])).toEqual(
      input.ranges.map(({ start, end }) => [start, end]),
    );
    expect(actual.ranges[0].end).toBe(actual.ranges[1].start);
    expect(actual.ranges[7].end).toBe(input.totalChars);
  });

  it('refuses empty, excess, sparse, accessor, subclass and extra-property arrays without getter execution', () => {
    let getterCalls = 0;
    const item = fixture().ranges[0];
    const accessor = [item];
    Object.defineProperty(accessor, '0', { enumerable: true, get() { getterCalls++; return item; } });
    const extra = Object.assign([item], { annotation: 'forbidden' });
    const symbol = [item];
    Object.defineProperty(symbol, Symbol('caller-data'), { value: true });
    class RangeArray extends Array<unknown> {}
    for (const ranges of [[], Array(9).fill(item), Array(1), accessor, extra, symbol, new RangeArray(item)]) {
      refused({ ...fixture(), ranges });
    }
    expect(getterCalls).toBe(0);
  });

  it('refuses invalid, overlapping, unsorted and out-of-bounds UTF-16 coordinates', () => {
    const range = (start: unknown, end: unknown) => ({ start, end, sha256: 'd'.repeat(64) });
    const invalid = [
      [range(3, 7), range(6, 9)], [range(7, 9), range(3, 6)], [range(4, 4)],
      [range(-1, 2)], [range(4.5, 9)], [range(4, 9.5)], [range(4, 13)],
      [range(4, Number.MAX_SAFE_INTEGER + 1)], [range('4', 9)], [range(4, Infinity)],
    ];
    for (const ranges of invalid) refused({ ...fixture(), ranges });
  });

  it('refuses root extensions, missing fields, non-data properties and inherited shapes', () => {
    for (const key of ['accepted_at', 'text', 'filename', 'modelOutput', 'unknown']) {
      refused({ ...fixture(), [key]: 'caller secret' });
    }
    const missing = { ...fixture() } as Record<string, unknown>;
    delete missing.actorId;
    refused(missing);
    const symbol = fixture();
    Object.defineProperty(symbol, Symbol('unknown'), { value: 'caller secret' });
    refused(symbol);
    const hidden = fixture();
    Object.defineProperty(hidden, 'actorId', { value: 42, enumerable: false });
    refused(hidden);
    let getterCalls = 0;
    const accessor = fixture();
    Object.defineProperty(accessor, 'actorId', { enumerable: true, get() { getterCalls++; return 42; } });
    refused(accessor);
    refused(Object.create(fixture()));
    refused(Object.assign(Object.create({ actorId: 42 }), fixture()));
    expect(getterCalls).toBe(0);
  });

  it('refuses non-exact range records without evaluating their getters', () => {
    let getterCalls = 0;
    const ordinary = fixture().ranges[0];
    const accessor = { ...ordinary };
    Object.defineProperty(accessor, 'sha256', { enumerable: true, get() { getterCalls++; return ordinary.sha256; } });
    const hidden = { ...ordinary };
    Object.defineProperty(hidden, 'end', { value: 9, enumerable: false });
    const symbol = { ...ordinary };
    Object.defineProperty(symbol, Symbol('unknown'), { value: 'caller secret' });
    for (const item of [{ ...ordinary, quote: 'source body' }, accessor, hidden, symbol,
      Object.assign(Object.create({}), ordinary)]) {
      refused({ ...fixture(), ranges: [item] });
    }
    expect(getterCalls).toBe(0);
  });

  it('bounds organization, actor and text length to positive int32 without coercion', () => {
    for (const field of ['organizationId', 'actorId', 'totalChars']) {
      for (const value of [0, -1, 1.5, 2_147_483_648, Infinity, NaN, '17', true, null]) {
        refused({ ...fixture(), [field]: value });
      }
      const valid = { ...fixture(), [field]: 2_147_483_647 };
      expect((validateSourceAdmissionReceiptV2(valid) as unknown as Record<string, unknown>)[field]).toBe(2_147_483_647);
    }
  });

  it('requires exact UUID and SHA256 shapes on all identity fields', () => {
    for (const field of ['receiptId', 'programId', 'documentId']) {
      for (const value of ['a'.repeat(32), ' AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
        'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAQ', '', 17, null]) {
        refused({ ...fixture(), [field]: value });
      }
    }
    for (const field of ['originalSha256', 'extractionSha256', 'payloadSha256']) {
      for (const value of ['a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'a'.repeat(64) + ' ', 17, null]) {
        refused({ ...fixture(), [field]: value });
      }
    }
    for (const value of ['d'.repeat(63), 'g'.repeat(64), 'd'.repeat(64) + '\n', null]) {
      refused({ ...fixture(), ranges: [{ start: 4, end: 9, sha256: value }] });
    }
    expect(validateSourceAdmissionReceiptV2(fixture()).receiptId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(validateSourceAdmissionReceiptV2(fixture()).ranges[0].sha256).toBe('d'.repeat(64));
  });

  it('accepts only numeric version 2 and the host-budget checkpoint', () => {
    for (const version of [1, 3, '2', true, null]) refused({ ...fixture(), version });
    for (const checkpoint of ['provider_delivered', 'scientifically_validated', 'host_budget_admitted ', null]) {
      refused({ ...fixture(), checkpoint });
    }
  });

  it('canonicalizes bounded Unicode role metadata without granting authority', () => {
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), admittedRole: '  CuStOm-ReadEr  ' }).admittedRole).toBe('custom-reader');
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), admittedRole: '🧬'.repeat(128) }).admittedRole).toBe('🧬'.repeat(128));
    for (const admittedRole of ['', '   ', 'a'.repeat(129), '🧬'.repeat(129), '\tviewer',
      'viewer\n', 'read\u007f', 'read\u0085', 'read\ud800', 'read\udc00', null, 42]) {
      refused({ ...fixture(), admittedRole });
    }
  });

  it('preserves bounded context code points and refuses controls or isolated surrogates', () => {
    for (const field of ['toolUseId', 'threadId']) {
      for (const value of [null, ' context-東京 🧬 ', '🧬'.repeat(2000)]) {
        expect((validateSourceAdmissionReceiptV2({ ...fixture(), [field]: value }) as unknown as Record<string, unknown>)[field]).toBe(value);
      }
      for (const value of ['', '   ', '🧬'.repeat(2001), 'a'.repeat(2001), 'id\u0000',
        'id\u009f', 'id\ud800', 'id\udc00', false, 17, undefined]) {
        refused({ ...fixture(), [field]: value });
      }
    }
  });

  it('distinguishes UTF-16 shape validation from actual source-slice hashing', () => {
    const source = 'pre🧬東京post';
    expect(source.length).toBe(11);
    expect(source.slice(3, 5)).toBe('🧬');
    expect(source.slice(3, 4)).toBe('\ud83e');
    const wholeHash = sha256(source.slice(3, 5));
    const splitHash = sha256(source.slice(3, 4));
    expect(wholeHash).not.toBe(splitHash);
    const whole = validateSourceAdmissionReceiptV2({ ...fixture(), totalChars: source.length,
      ranges: [{ start: 3, end: 5, sha256: wholeHash }] });
    const split = validateSourceAdmissionReceiptV2({ ...fixture(), totalChars: source.length,
      ranges: [{ start: 3, end: 4, sha256: splitHash }] });
    expect(whole.ranges[0]).toEqual({ start: 3, end: 5, sha256: wholeHash });
    expect(split.ranges[0]).toEqual({ start: 3, end: 4, sha256: splitHash });
    // DTO validation has no text argument and cannot attest that this digest is correct.
    const wrongButWellShaped = validateSourceAdmissionReceiptV2({ ...fixture(), totalChars: source.length,
      ranges: [{ start: 3, end: 5, sha256: '0'.repeat(64) }] });
    expect(wrongButWellShaped.ranges[0].sha256).not.toBe(wholeHash);
  });

  it('sanitizes reflection exceptions and diagnostics without leaking caller data', () => {
    const secret = 'UNPUBLISHABLE_CALLER_BODY_918273';
    const hostile = new Proxy(fixture(), { ownKeys() { throw new Error(secret); } });
    const reflection = refused(hostile);
    expect(reflection.reasonCode).toBe('SHAPE');
    expect(reflection.field).toBe('descriptor');
    for (const input of [hostile, { ...fixture(), actorId: secret }, { ...fixture(), threadId: secret + '\n' }]) {
      const error = refused(input);
      expect(JSON.stringify({ code: error.code, reason: error.reasonCode, field: error.field, message: error.message })).not.toContain(secret);
    }
  });
});
