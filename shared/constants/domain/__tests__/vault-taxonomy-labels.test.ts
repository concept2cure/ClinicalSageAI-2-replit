/**
 * The ingest vocabulary has reader-facing names.
 *
 * `VAULT_INGEST_DOCUMENT_TYPES` are wire tokens — what the Zod enum accepts and
 * what lands in `vault.documents.document_type`. They are not English, and the
 * Vault surface used to render the token itself when the classifier had not
 * assigned an evidence kind, so a regulatory reviewer saw `MODULE_3` and
 * `CORRESPONDENCE` in the document list. Correct data, nobody's vocabulary.
 *
 * The map lives beside the enum for the reason the enum's own note gives — one
 * list, shared — so the two cannot drift. The first test here is that
 * completeness check, and it is the one that matters: a type added to the enum
 * and not to the map is exactly how the raw token comes back.
 */
import { describe, it, expect } from 'vitest';
import {
  VAULT_INGEST_DOCUMENT_TYPES,
  VAULT_INGEST_TYPE_LABEL,
  vaultIngestTypeLabel,
} from '../vault-taxonomy';

describe('every ingest type has a name', () => {
  it('covers the enum exactly — no gaps, no strays', () => {
    // A gap means the raw token reaches a reader. A stray means the map
    // describes a type the server would refuse.
    expect(Object.keys(VAULT_INGEST_TYPE_LABEL).sort()).toEqual(
      [...VAULT_INGEST_DOCUMENT_TYPES].sort(),
    );
  });

  it('never leaves a label looking like a wire token', () => {
    for (const t of VAULT_INGEST_DOCUMENT_TYPES) {
      const label = VAULT_INGEST_TYPE_LABEL[t];
      expect(label, `${t} has no label`).toBeTruthy();
      // UPPER_SNAKE is the token shape; a label in that shape is the bug this
      // map exists to remove, not a name.
      expect(label, `${t} is labelled with a wire token`).not.toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('spells out the module numbers a reviewer reads', () => {
    expect(vaultIngestTypeLabel('MODULE_3')).toMatch(/Module 3/);
    expect(vaultIngestTypeLabel('CORRESPONDENCE')).toMatch(/correspondence/i);
    expect(vaultIngestTypeLabel('CSR')).toMatch(/clinical study report/i);
  });
});

describe('a value outside the enum', () => {
  it('comes back as ITSELF, not reclassified as Other', () => {
    // document_type is TEXT with no CHECK, so an older row or another writer
    // can hold anything. The token is ugly but true; "Other" would be a
    // classification nobody made.
    expect(vaultIngestTypeLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });

  it('does not reach Object.prototype', () => {
    // A bare index would return a Function for each of these, which then
    // renders as [object Function] where a document type belongs.
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__']) {
      expect(typeof vaultIngestTypeLabel(key)).toBe('string');
      expect(vaultIngestTypeLabel(key)).toBe(key);
    }
  });
});
