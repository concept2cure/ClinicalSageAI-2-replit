/**
 * Veeva Vault ↔ C2C document field mapping (workflow layer, part 1).
 *
 * Vault documents carry Vault-managed fields (`name__v`, `type__v`,
 * `lifecycle__v`, …); C2C documents carry platform metadata (title, CTD
 * section, document type). This module is the PURE translation between the
 * two, so the sync service stays mechanical and the mapping is unit-testable
 * and per-org overridable.
 *
 * Defaults map C2C document types onto Vault's standard RIM/Clinical document
 * type names; organizations whose Vault uses custom types pass an override
 * map (Vault type taxonomies are admin-configured per Vault).
 *
 * @module server/integrations/veeva-vault/field-mapping
 */

import type { VaultDocument } from './client';

/** The C2C-side metadata the mapping consumes/produces. */
export interface C2cDocumentMeta {
  title: string;
  /** Platform document classifier, e.g. 'protocol', 'csr', 'ib', 'cmc'. */
  documentType?: string | null;
  /** CTD section code, e.g. '5.3.5.1'. */
  sectionCode?: string | null;
}

/** Default C2C documentType → Vault type__v mapping (standard Vault RIM names). */
const DEFAULT_TYPE_MAP: Record<string, string> = {
  protocol: 'Protocol',
  csr: 'Clinical Study Report',
  ib: "Investigator's Brochure",
  cmc: 'Quality Document',
  cer: 'Clinical Evaluation Report',
  sap: 'Statistical Analysis Plan',
  cover_letter: 'Cover Letter',
};

export interface VaultFieldMappingOptions {
  /** Per-org override/extension of the documentType → type__v map. */
  typeMap?: Record<string, string>;
  /** Vault lifecycle to assign on create (admin-configured per Vault). */
  lifecycle?: string;
  /** Extra constant fields every pushed document should carry. */
  extraFields?: Record<string, string>;
}

/**
 * Map C2C document metadata to the Vault create-document field set.
 * `name__v` is required by Vault; the CTD section is preserved in the name
 * suffix so Vault-side users can locate dossier placement at a glance.
 */
export function toVaultFields(
  meta: C2cDocumentMeta,
  options: VaultFieldMappingOptions = {},
): Record<string, string> {
  const typeMap = { ...DEFAULT_TYPE_MAP, ...(options.typeMap ?? {}) };
  const fields: Record<string, string> = {
    name__v: meta.sectionCode ? `${meta.title} (${meta.sectionCode})` : meta.title,
    ...(options.extraFields ?? {}),
  };
  const mappedType = meta.documentType ? typeMap[meta.documentType.toLowerCase()] : undefined;
  if (mappedType) fields['type__v'] = mappedType;
  if (options.lifecycle) fields['lifecycle__v'] = options.lifecycle;
  return fields;
}

/**
 * Map a Vault document back onto C2C metadata (pull direction). The reverse
 * type lookup is best-effort: unmapped Vault types pass through verbatim in
 * `documentType` so nothing is silently dropped.
 */
export function fromVaultDocument(
  doc: VaultDocument,
  options: VaultFieldMappingOptions = {},
): C2cDocumentMeta & { vaultStatus?: string; vaultLifecycle?: string } {
  const typeMap = { ...DEFAULT_TYPE_MAP, ...(options.typeMap ?? {}) };
  const reverse = new Map(Object.entries(typeMap).map(([c2c, vault]) => [vault, c2c]));
  // Strip the "(section)" suffix toVaultFields appends, recovering both parts.
  const m = /^(.*) \(([\d.]+(?:\.[A-Za-z]+)*)\)$/.exec(doc.name);
  return {
    title: m ? m[1] : doc.name,
    sectionCode: m ? m[2] : null,
    documentType: doc.type ? (reverse.get(doc.type) ?? doc.type) : null,
    vaultStatus: doc.status,
    vaultLifecycle: doc.lifecycle,
  };
}

export default { toVaultFields, fromVaultDocument };
