/** Server-owned contributors remain part of the controlled, digest-bound metadata. */
export class QmsControlledTextAuthorshipInvalid extends Error {
  constructor() { super('The recorded controlled-text authorship needs review before this document can be changed or approved.'); }
}

function object(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new QmsControlledTextAuthorshipInvalid();
  return value as Record<string, unknown>;
}

export function qmsControlledTextAuthorIds(metadata: unknown): number[] {
  const record = object(metadata);
  if (!Object.prototype.hasOwnProperty.call(record, 'controlledTextAuthorship')) return [];
  const block = object(record.controlledTextAuthorship);
  const ids = block.authorUserIds;
  if (Object.keys(block).some(key => key !== 'authorUserIds') || !Array.isArray(ids) || !ids.length
    || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new QmsControlledTextAuthorshipInvalid();
  }
  return [...ids];
}

export function withQmsControlledTextAuthor(metadata: unknown, userId: number): Record<string, unknown> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new QmsControlledTextAuthorshipInvalid();
  const authorUserIds = [...new Set([...qmsControlledTextAuthorIds(metadata), userId])].sort((a, b) => a - b);
  return { ...object(metadata), controlledTextAuthorship: { authorUserIds } };
}
