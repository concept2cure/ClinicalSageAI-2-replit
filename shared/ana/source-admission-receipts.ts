import { stableStringify } from '../canonical-json';

/** Metadata-only identity of exact source text admitted by the host budget. */
export interface SourceAdmissionRangeV2 {
  readonly start: number;
  readonly end: number;
  readonly sha256: string;
}

export interface SourceAdmissionReceiptV2 {
  readonly version: 2;
  readonly receiptId: string;
  readonly checkpoint: 'host_budget_admitted';
  readonly organizationId: number;
  readonly actorId: number;
  readonly admittedRole: string;
  readonly programId: string;
  readonly documentId: string;
  readonly originalSha256: string;
  readonly extractionSha256: string;
  readonly totalChars: number;
  readonly ranges: readonly SourceAdmissionRangeV2[];
  readonly payloadSha256: string;
  readonly toolUseId: string | null;
  readonly threadId: string | null;
}

type ValidationReason = 'SHAPE' | 'IDENTITY' | 'CHECKPOINT' | 'RANGE' | 'METADATA';

/** Safe diagnostics contain controlled field names, never descriptor values. */
export class SourceAdmissionReceiptValidationError extends Error {
  readonly code = 'INVALID_SOURCE_ADMISSION_RECEIPT';

  constructor(readonly reasonCode: ValidationReason, readonly field: string) {
    super('Source admission receipt is invalid.');
    this.name = 'SourceAdmissionReceiptValidationError';
  }
}

const DESCRIPTOR_KEYS = Object.freeze([
  'version', 'receiptId', 'checkpoint', 'organizationId', 'actorId', 'admittedRole',
  'programId', 'documentId', 'originalSha256', 'extractionSha256', 'totalChars',
  'ranges', 'payloadSha256', 'toolUseId', 'threadId',
]);
const RANGE_KEYS = Object.freeze(['start', 'end', 'sha256']);
const MAX_INT32 = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function refuse(reason: ValidationReason, field: string): never {
  throw new SourceAdmissionReceiptValidationError(reason, field);
}

/** Inspect own data descriptors; input accessors are never evaluated. */
function exactRecord(input: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) refuse('SHAPE', field);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) refuse('SHAPE', field);
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) {
    refuse('SHAPE', field);
  }
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) refuse('SHAPE', field);
    copy[key] = descriptor.value;
  }
  return copy;
}

function positiveInt32(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1 || input > MAX_INT32) refuse('IDENTITY', field);
  return input;
}

function uuid(input: unknown, field: string): string {
  if (typeof input !== 'string' || !UUID.test(input)) refuse('IDENTITY', field);
  return input.toLowerCase();
}

function sha256(input: unknown, field: string): string {
  if (typeof input !== 'string' || !SHA256.test(input)) refuse('IDENTITY', field);
  return input.toLowerCase();
}

function metadataCodePoints(input: string, max: number, field: string): void {
  // Every Unicode code point consumes at most two UTF-16 code units.
  if (input.length > max * 2) refuse('METADATA', field);
  let count = 0;
  for (const character of input) {
    const point = character.codePointAt(0)!;
    if (point <= 0x1f || (point >= 0x7f && point <= 0x9f) || (point >= 0xd800 && point <= 0xdfff)) {
      refuse('METADATA', field);
    }
    if (++count > max) refuse('METADATA', field);
  }
}

function role(input: unknown): string {
  if (typeof input !== 'string') refuse('METADATA', 'admittedRole');
  // Check the supplied spelling too: trimming must not hide controls.
  metadataCodePoints(input, Math.max(input.length, 1), 'admittedRole');
  const canonical = input.trim().toLowerCase();
  if (!canonical) refuse('METADATA', 'admittedRole');
  metadataCodePoints(canonical, 128, 'admittedRole');
  return canonical;
}

function context(input: unknown, field: 'toolUseId' | 'threadId'): string | null {
  if (input === null) return null;
  if (typeof input !== 'string' || !input.trim()) refuse('METADATA', field);
  metadataCodePoints(input, 2000, field);
  return input;
}

function validatedRange(input: unknown, totalChars: number, previousEnd: number): SourceAdmissionRangeV2 {
  const item = exactRecord(input, RANGE_KEYS, 'ranges');
  const { start, end } = item;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < previousEnd || start < 0 || start >= end || end > totalChars) {
    refuse('RANGE', 'ranges');
  }
  return Object.freeze(Object.assign(Object.create(null), {
    start, end, sha256: sha256(item.sha256, 'ranges'),
  })) as SourceAdmissionRangeV2;
}

function ranges(input: unknown, totalChars: number): readonly SourceAdmissionRangeV2[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) refuse('RANGE', 'ranges');
  const length = Object.getOwnPropertyDescriptor(input, 'length');
  if (!length || !Object.hasOwn(length, 'value') || !Number.isSafeInteger(length.value) || length.value < 1 || length.value > 8) {
    refuse('RANGE', 'ranges');
  }
  const count: number = length.value;
  const expectedKeys = ['length', ...Array.from({ length: count }, (_, index) => String(index))];
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) refuse('RANGE', 'ranges');
  const copy: SourceAdmissionRangeV2[] = [];
  let previousEnd = 0;
  for (let index = 0; index < count; index++) {
    const slot = Object.getOwnPropertyDescriptor(input, String(index));
    if (!slot || !slot.enumerable || !Object.hasOwn(slot, 'value')) refuse('RANGE', 'ranges');
    const range = validatedRange(slot.value, totalChars, previousEnd);
    copy.push(range);
    previousEnd = range.end;
  }
  return Object.freeze(copy);
}

/**
 * Validate and synchronously copy an exact metadata descriptor. This validates
 * hash/coordinate shape; server admission separately verifies actual source and
 * slice hashes. It neither grants authority nor generates a receipt identity.
 */
export function validateSourceAdmissionReceiptV2(input: unknown): SourceAdmissionReceiptV2 {
  try {
    const value = exactRecord(input, DESCRIPTOR_KEYS, 'descriptor');
    if (value.version !== 2 || value.checkpoint !== 'host_budget_admitted') refuse('CHECKPOINT', 'checkpoint');
    const totalChars = positiveInt32(value.totalChars, 'totalChars');
    return Object.freeze(Object.assign(Object.create(null), {
      version: 2,
      receiptId: uuid(value.receiptId, 'receiptId'),
      checkpoint: 'host_budget_admitted',
      organizationId: positiveInt32(value.organizationId, 'organizationId'),
      actorId: positiveInt32(value.actorId, 'actorId'),
      admittedRole: role(value.admittedRole),
      programId: uuid(value.programId, 'programId'),
      documentId: uuid(value.documentId, 'documentId'),
      originalSha256: sha256(value.originalSha256, 'originalSha256'),
      extractionSha256: sha256(value.extractionSha256, 'extractionSha256'),
      totalChars,
      ranges: ranges(value.ranges, totalChars),
      payloadSha256: sha256(value.payloadSha256, 'payloadSha256'),
      toolUseId: context(value.toolUseId, 'toolUseId'),
      threadId: context(value.threadId, 'threadId'),
    })) as SourceAdmissionReceiptV2;
  } catch (error) {
    if (error instanceof SourceAdmissionReceiptValidationError) throw error;
    // Reflection/proxy failures must not leak caller data or raw error details.
    throw new SourceAdmissionReceiptValidationError('SHAPE', 'descriptor');
  }
}

/** Existing canonical JSON serializer; database acceptance time is not a field. */
export function canonicalSourceAdmissionReceiptV2(input: unknown): string {
  return stableStringify(validateSourceAdmissionReceiptV2(input));
}

/** Private snapshot and UTF-8 bytes are fixed before the first async boundary. */
export async function fingerprintSourceAdmissionReceiptV2(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSourceAdmissionReceiptV2(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
