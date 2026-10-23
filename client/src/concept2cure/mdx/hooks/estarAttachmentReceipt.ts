import { ATTACHMENT_MANIFEST_SEED, PRESTAR_ATTACHMENT_MANIFEST_SEED, ESTAR_CHAPTER_PATH } from '@shared/regulatory/estar-attachment-manifest';

/** The person's exact version/slot choice; its hash is local delivery evidence. */
export interface OfficialEstarAttachment {
  slot: string;
  source: { kind: 'vault_document'; documentId: string };
  expectedSha256: string;
}

export interface EstarAttachmentReceipt {
  slot: string;
  source: { kind: 'vault_document'; documentId: string };
  fileName: string;
  sha256: string;
  byteLength: number;
  chapter: string;
}

export interface EstarAttachmentRefusal {
  slot: string;
  reasons: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 &&
  Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keyOf = (slot: string, id: string) => `${slot}\0${id.toLowerCase()}`;
function vaultSource(value: unknown): value is OfficialEstarAttachment['source'] {
  return object(value) && value.kind === 'vault_document' && typeof value.documentId === 'string' && UUID.test(value.documentId);
}

/** Copy before awaiting, so an edited caller array cannot change the promise. */
export function copyAttachmentSelections(selections: readonly OfficialEstarAttachment[]): OfficialEstarAttachment[] | null {
  if (!Array.isArray(selections)) return null;
  const seen = new Set<string>();
  const copied: OfficialEstarAttachment[] = [];
  for (const selection of selections) {
    if (!selection || !text(selection.slot) || !vaultSource(selection.source) ||
        typeof selection.expectedSha256 !== 'string' || !SHA256.test(selection.expectedSha256)) return null;
    const key = keyOf(selection.slot, selection.source.documentId);
    if (seen.has(key)) return null;
    seen.add(key);
    copied.push({ slot: selection.slot, source: { kind: 'vault_document', documentId: selection.source.documentId }, expectedSha256: selection.expectedSha256 });
  }
  return copied;
}

function parseReceipt(value: unknown): EstarAttachmentReceipt | null {
  if (!object(value) || !text(value.slot) || !vaultSource(value.source) ||
      !text(value.fileName) || /[<>|]/.test(value.fileName) || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256) ||
      typeof value.byteLength !== 'number' || !Number.isSafeInteger(value.byteLength) || value.byteLength <= 0 ||
      typeof value.chapter !== 'string' || !ESTAR_CHAPTER_PATH.test(value.chapter)) return null;
  return {
    slot: value.slot, source: { kind: 'vault_document', documentId: value.source.documentId },
    fileName: value.fileName, sha256: value.sha256, byteLength: value.byteLength, chapter: value.chapter,
  };
}

/** A success must account for every selected UUID/slot/hash exactly once. */
export function confirmedAttachmentReceipts(raw: unknown, expected: readonly OfficialEstarAttachment[]): EstarAttachmentReceipt[] | null {
  if (!object(raw) || raw.requested !== expected.length || !Array.isArray(raw.attached) ||
      raw.attached.length !== expected.length || !Array.isArray(raw.refused) || raw.refused.length !== 0 ||
      !text(raw.manifest)) return null;
  const pending = new Map(expected.map(selection => [keyOf(selection.slot, selection.source.documentId), selection.expectedSha256]));
  if (pending.size !== expected.length) return null;
  const receipts: EstarAttachmentReceipt[] = [];
  for (const value of raw.attached) {
    const receipt = parseReceipt(value);
    if (!receipt) return null;
    const key = keyOf(receipt.slot, receipt.source.documentId);
    if (pending.get(key) !== receipt.sha256) return null;
    pending.delete(key);
    receipts.push(receipt);
  }
  const tokens = receipts.map(receipt => `<<${receipt.fileName}|${receipt.chapter}>>`).join('');
  const manifestMatches = [ATTACHMENT_MANIFEST_SEED, PRESTAR_ATTACHMENT_MANIFEST_SEED].some(seed => raw.manifest === seed + tokens);
  return pending.size === 0 && manifestMatches ? receipts : null;
}

/** Refusals describe the server's verdict, including all independent reasons. */
export function attachmentRefusals(raw: unknown): EstarAttachmentRefusal[] {
  if (!object(raw) || !Array.isArray(raw.refused)) return [];
  return raw.refused.flatMap(value => {
    if (!object(value) || !text(value.slot) || !Array.isArray(value.reasons) || !value.reasons.length || !value.reasons.every(text)) return [];
    return [{ slot: value.slot, reasons: [...value.reasons] as string[] }];
  });
}
