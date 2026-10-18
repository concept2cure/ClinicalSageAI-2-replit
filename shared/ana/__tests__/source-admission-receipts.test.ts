import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SourceAdmissionReceiptValidationError,
  canonicalSourceAdmissionReceiptV2,
  fingerprintSourceAdmissionReceiptV2,
  validateSourceAdmissionReceiptV2,
} from '../source-admission-receipts';

function fixture() {
  return {
    version: 2 as const,
    receiptId: '90000000-0000-4000-8000-000000000001',
    checkpoint: 'host_budget_admitted' as const,
    organizationId: 42,
    actorId: 7,
    admittedRole: 'viewer',
    programId: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    originalSha256: 'a'.repeat(64),
    extractionSha256: '1'.repeat(64),
    totalChars: 100,
    ranges: [{ start: 50, end: 70, sha256: 'c'.repeat(64) }],
    payloadSha256: 'b'.repeat(64),
    toolUseId: 'toolu_42',
    threadId: 'thread-42',
  };
}

// Independent Python sorted JSON / UTF-8 SHA256 vector, fixed before implementation.
const GOLDEN_CANONICAL = '{"actorId":7,"admittedRole":"viewer","checkpoint":"host_budget_admitted","documentId":"20000000-0000-4000-8000-000000000001","extractionSha256":"1111111111111111111111111111111111111111111111111111111111111111","organizationId":42,"originalSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","payloadSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","programId":"10000000-0000-4000-8000-000000000001","ranges":[{"end":70,"sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","start":50}],"receiptId":"90000000-0000-4000-8000-000000000001","threadId":"thread-42","toolUseId":"toolu_42","totalChars":100,"version":2}';
const GOLDEN_SHA = '1c02dabcd3bd527462a693e7934a9f2b1e83eab6ce3891a724803be0f53ef5d8';

function refuses(input: unknown) {
  expect(() => validateSourceAdmissionReceiptV2(input)).toThrow(SourceAdmissionReceiptValidationError);
}

describe('strict metadata-only descriptor shape', () => {
  it('returns a private frozen primitive/range snapshot and retains the supplied receipt ID', () => {
    const input = fixture();
    const result = validateSourceAdmissionReceiptV2(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.ranges).not.toBe(input.ranges);
    expect(result.ranges[0]).not.toBe(input.ranges[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ranges)).toBe(true);
    expect(Object.isFrozen(result.ranges[0])).toBe(true);
    input.actorId = 99;
    input.ranges[0].end = 90;
    expect(result.actorId).toBe(7);
    expect(result.ranges[0].end).toBe(70);
    expect(result.receiptId).toBe('90000000-0000-4000-8000-000000000001');
    expect(validateSourceAdmissionReceiptV2(result)).toEqual(result);
  });

  it.each([
    ['null', null], ['array', []], ['date', new Date(0)],
    ['string', 'receipt'], ['number', 2], ['boolean', true],
    ['custom prototype', Object.assign(Object.create({ extra: true }), fixture())],
  ])('refuses %s input', (_label, value) => refuses(value));

  it.each(Object.keys(fixture()))('refuses missing %s, including nullable fields', (key) => {
    const value: Record<string, unknown> = fixture();
    delete value[key];
    refuses(value);
  });

  it.each(['sourceText', 'filename', 'dossier', 'modelOutput', 'acceptedAt', 'accepted_at', 'providerServed', 'toJSON'])('refuses unknown %s without silently dropping metadata', (key) => {
    refuses({ ...fixture(), [key]: 'PRIVATE_SOURCE_SENTINEL' });
  });

  it('refuses symbol and nonenumerable extras', () => {
    const symbol = fixture();
    Object.defineProperty(symbol, Symbol('source'), { value: 'PRIVATE_SOURCE_SENTINEL' });
    refuses(symbol);
    const hidden = fixture();
    Object.defineProperty(hidden, 'sourceText', { value: 'PRIVATE_SOURCE_SENTINEL' });
    refuses(hidden);
  });

  it('refuses inherited identity and nonenumerable required keys', () => {
    const { actorId, ...rest } = fixture();
    refuses(Object.assign(Object.create({ actorId }), rest));
    const hidden = fixture();
    Object.defineProperty(hidden, 'actorId', { value: 7, enumerable: false });
    refuses(hidden);
  });

  it('refuses descriptor and range accessors without executing them', () => {
    let calls = 0;
    const accessor = fixture();
    Object.defineProperty(accessor, 'actorId', { enumerable: true, get() { calls++; return 7; } });
    refuses(accessor);
    const rangeAccessor = fixture();
    Object.defineProperty(rangeAccessor.ranges[0], 'end', { enumerable: true, get() { calls++; return 70; } });
    refuses(rangeAccessor);
    expect(calls).toBe(0);
  });

  it('sanitizes unexpected reflection errors and never includes supplied content', () => {
    const value = new Proxy(fixture(), { ownKeys() { throw new Error('PRIVATE_SOURCE_SENTINEL'); } });
    try {
      validateSourceAdmissionReceiptV2(value);
      expect.unreachable('proxy must refuse');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceAdmissionReceiptValidationError);
      expect(String(error)).not.toContain('PRIVATE_SOURCE_SENTINEL');
      expect((error as SourceAdmissionReceiptValidationError).code).toBe('INVALID_SOURCE_ADMISSION_RECEIPT');
    }
  });

  it.each([['version', 1], ['version', '2'], ['checkpoint', 'provider_served'], ['checkpoint', 'host_budget_admitted ']])('refuses invalid %s=%s', (key, value) => refuses({ ...fixture(), [key]: value }));
});

describe('canonical bounded identity', () => {
  it.each(['organizationId', 'actorId', 'totalChars'])('refuses invalid positive int32 %s', (key) => {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, '42', null]) {
      refuses({ ...fixture(), [key]: value });
    }
  });

  it('accepts the positive int32 boundary', () => {
    const result = validateSourceAdmissionReceiptV2({ ...fixture(), organizationId: 2_147_483_647, actorId: 2_147_483_647, totalChars: 2_147_483_647 });
    expect(result.totalChars).toBe(2_147_483_647);
  });

  it.each(['receiptId', 'programId', 'documentId'])('refuses malformed %s without minting an ID', (key) => {
    for (const value of ['', 'not-a-uuid', '90000000000040008000000000000001', `${fixture().receiptId} `, `${fixture().receiptId}\n`, null, undefined, 1]) {
      refuses({ ...fixture(), [key]: value });
    }
  });

  it.each(['originalSha256', 'extractionSha256', 'payloadSha256'])('refuses malformed %s', (key) => {
    for (const value of ['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `${'a'.repeat(64)} `, `${'a'.repeat(64)}\n`, null, 1]) {
      refuses({ ...fixture(), [key]: value });
    }
  });

  it('normalizes UUID and SHA casing while preserving viewer/custom role semantics', () => {
    const id = 'abcdefab-cdef-4000-8000-abcdefabcdef';
    const result = validateSourceAdmissionReceiptV2({ ...fixture(), receiptId: id.toUpperCase(), programId: id.toUpperCase(), documentId: id.toUpperCase(), admittedRole: '  Custom Reader  ', originalSha256: 'A'.repeat(64), extractionSha256: 'B'.repeat(64), payloadSha256: 'C'.repeat(64), ranges: [{ start: 50, end: 70, sha256: 'D'.repeat(64) }] });
    expect(result.receiptId).toBe(id);
    expect(result.programId).toBe(id);
    expect(result.documentId).toBe(id);
    expect(result.admittedRole).toBe('custom reader');
    expect(result.originalSha256).toBe('a'.repeat(64));
    expect(result.ranges[0].sha256).toBe('d'.repeat(64));
  });
});

describe('exact disjoint UTF-16 range manifest', () => {
  it('keeps disjoint late and adjacent ranges separate without synthesizing joins', () => {
    const ranges = [{ start: 50, end: 60, sha256: 'c'.repeat(64) }, { start: 60, end: 70, sha256: 'd'.repeat(64) }, { start: 90, end: 100, sha256: 'e'.repeat(64) }];
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), ranges }).ranges).toEqual(ranges);
  });

  it('accepts eight bounded ranges and offset zero', () => {
    const ranges = Array.from({ length: 8 }, (_, index) => ({ start: index * 10, end: index * 10 + 5, sha256: 'c'.repeat(64) }));
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), ranges }).ranges).toEqual(ranges);
  });

  it.each([
    ['empty', []], ['nonarray', {}], ['null', null],
    ['nine', Array.from({ length: 9 }, (_, index) => ({ start: index * 10, end: index * 10 + 5, sha256: 'c'.repeat(64) }))],
    ['sparse', new Array(1)], ['undefined element', [undefined]], ['null element', [null]],
    ['negative', [{ start: -1, end: 10, sha256: 'c'.repeat(64) }]],
    ['empty interval', [{ start: 50, end: 50, sha256: 'c'.repeat(64) }]],
    ['inverted', [{ start: 70, end: 50, sha256: 'c'.repeat(64) }]],
    ['past extraction', [{ start: 50, end: 101, sha256: 'c'.repeat(64) }]],
    ['fractional', [{ start: 50.5, end: 70, sha256: 'c'.repeat(64) }]],
    ['NaN', [{ start: NaN, end: 70, sha256: 'c'.repeat(64) }]],
    ['Infinity', [{ start: 50, end: Infinity, sha256: 'c'.repeat(64) }]],
    ['unsafe', [{ start: 50, end: Number.MAX_SAFE_INTEGER + 1, sha256: 'c'.repeat(64) }]],
    ['string offset', [{ start: '50', end: 70, sha256: 'c'.repeat(64) }]],
    ['overlap', [{ start: 50, end: 70, sha256: 'c'.repeat(64) }, { start: 69, end: 80, sha256: 'd'.repeat(64) }]],
    ['unsorted', [{ start: 90, end: 100, sha256: 'c'.repeat(64) }, { start: 50, end: 70, sha256: 'd'.repeat(64) }]],
    ['unknown range text', [{ start: 50, end: 70, sha256: 'c'.repeat(64), quote: 'PRIVATE_SOURCE_SENTINEL' }]],
    ['missing range SHA', [{ start: 50, end: 70 }]],
    ['bad range SHA', [{ start: 50, end: 70, sha256: 'x'.repeat(64) }]],
    ['range SHA line terminator', [{ start: 50, end: 70, sha256: `${'c'.repeat(64)}\n` }]],
  ])('refuses %s ranges', (_label, ranges) => refuses({ ...fixture(), ranges }));

  it('refuses accessor indices, extra array properties and custom array prototypes', () => {
    let calls = 0;
    const accessors = fixture().ranges;
    Object.defineProperty(accessors, '0', { enumerable: true, get() { calls++; return { start: 50, end: 70, sha256: 'c'.repeat(64) }; } });
    refuses({ ...fixture(), ranges: accessors });
    expect(calls).toBe(0);
    const extra = fixture().ranges;
    Object.defineProperty(extra, 'sourceText', { value: 'PRIVATE_SOURCE_SENTINEL' });
    refuses({ ...fixture(), ranges: extra });
    const symbol = fixture().ranges;
    Object.defineProperty(symbol, Symbol('range'), { value: true });
    refuses({ ...fixture(), ranges: symbol });
    const custom = fixture().ranges;
    Object.setPrototypeOf(custom, Object.create(Array.prototype));
    refuses({ ...fixture(), ranges: custom });
  });
});

describe('Unicode metadata bounds and opaque serving context', () => {
  it.each(['', '  ', 'x'.repeat(129), '😀'.repeat(129), 'viewer\u0000', 'viewer\u001f', 'viewer\u007f', 'viewer\u0085', 'viewer\u009f', 'viewer\ud800', 'viewer\udfff'])('refuses invalid role %j', (admittedRole) => refuses({ ...fixture(), admittedRole }));

  it('accepts exactly 128 Unicode role code points and canonicalizes fresh role spelling', () => {
    const admittedRole = '😀'.repeat(128);
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), admittedRole }).admittedRole).toBe(admittedRole);
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), admittedRole: '  RéViewER  ' }).admittedRole).toBe('réviewer');
  });

  it.each(['toolUseId', 'threadId'])('refuses invalid bounded %s', (key) => {
    for (const value of ['', ' \u00a0 ', 'x'.repeat(2001), '😀'.repeat(2001), 'ctx\u000a', 'ctx\u007f', 'ctx\u0085', 'ctx\u009f', 'ctx\ud800', 'ctx\udfff', undefined, 5, {}]) {
      refuses({ ...fixture(), [key]: value });
    }
  });

  it('accepts null context and preserves exact opaque spaces and 2000 Unicode code points', () => {
    expect(validateSourceAdmissionReceiptV2({ ...fixture(), toolUseId: null, threadId: null }).threadId).toBeNull();
    const threadId = '😀'.repeat(2000);
    const result = validateSourceAdmissionReceiptV2({ ...fixture(), toolUseId: ' toolu_42 ', threadId });
    expect(result.threadId).toBe(threadId);
    expect(result.toolUseId).toBe(' toolu_42 ');
  });

  it('refuses lowercasing that expands the canonical role beyond the bound', () => {
    refuses({ ...fixture(), admittedRole: 'İ'.repeat(65) });
  });
});

describe('canonical immutable descriptor fingerprint', () => {
  it('matches fixed canonical JSON and independent SHA256', async () => {
    expect(canonicalSourceAdmissionReceiptV2(fixture())).toBe(GOLDEN_CANONICAL);
    expect(createHash('sha256').update(GOLDEN_CANONICAL, 'utf8').digest('hex')).toBe(GOLDEN_SHA);
    expect(await fingerprintSourceAdmissionReceiptV2(fixture())).toBe(GOLDEN_SHA);
  });

  it('ignores input insertion order and canonical ID/hash/role casing', async () => {
    const input = fixture();
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    const uppercase = { ...input, admittedRole: ' VIEWER ', originalSha256: input.originalSha256.toUpperCase(), payloadSha256: input.payloadSha256.toUpperCase(), ranges: [{ ...input.ranges[0], sha256: input.ranges[0].sha256.toUpperCase() }] };
    expect(await fingerprintSourceAdmissionReceiptV2(reordered)).toBe(GOLDEN_SHA);
    expect(await fingerprintSourceAdmissionReceiptV2(uppercase)).toBe(GOLDEN_SHA);
  });

  it.each([
    ['receiptId', '90000000-0000-4000-8000-000000000002'], ['organizationId', 43], ['actorId', 8], ['admittedRole', 'custom reader'],
    ['programId', '10000000-0000-4000-8000-000000000002'], ['documentId', '20000000-0000-4000-8000-000000000002'],
    ['originalSha256', 'd'.repeat(64)], ['extractionSha256', 'e'.repeat(64)], ['totalChars', 101],
    ['ranges', [{ start: 50, end: 71, sha256: 'c'.repeat(64) }]], ['ranges', [{ start: 50, end: 70, sha256: 'd'.repeat(64) }]],
    ['payloadSha256', 'f'.repeat(64)], ['toolUseId', null], ['toolUseId', ' toolu_42 '], ['threadId', null],
  ])('pins every immutable identity component: %s', async (key, value) => {
    expect(await fingerprintSourceAdmissionReceiptV2({ ...fixture(), [key]: value })).not.toBe(GOLDEN_SHA);
  });

  it('takes a private synchronous snapshot before asynchronous digest completion', async () => {
    const input = fixture();
    const fingerprint = fingerprintSourceAdmissionReceiptV2(input);
    input.actorId = 99;
    input.receiptId = '90000000-0000-4000-8000-000000000002';
    input.ranges[0].start = 0;
    input.ranges[0].sha256 = 'f'.repeat(64);
    input.threadId = 'changed-context';
    expect(await fingerprint).toBe(GOLDEN_SHA);
  });

  it('refuses acceptance time and plaintext rather than silently excluding them from hashing', async () => {
    await expect(fingerprintSourceAdmissionReceiptV2({ ...fixture(), acceptedAt: '2026-10-14T00:00:00Z' })).rejects.toBeInstanceOf(SourceAdmissionReceiptValidationError);
    await expect(fingerprintSourceAdmissionReceiptV2({ ...fixture(), sourceText: 'PRIVATE_SOURCE_SENTINEL' })).rejects.toBeInstanceOf(SourceAdmissionReceiptValidationError);
  });
});
