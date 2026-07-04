/**
 * TMF Reference Model zones — shared (client-safe) mirror.
 *
 * The platform eTMF's canonical TMF logic lives server-side:
 *   - server/services/etmf/etmf-logic.ts        — zone catalog + auto-classifier
 *   - server/services/etmf/tmf-completeness.ts  — zones + essential artifacts
 *     (ICH E6(R2) §8) + inspection-readiness assessment
 *
 * Client code (the vault's service/CRO view, eTMF surfaces) cannot import
 * server services, so this module mirrors the ZONE level of that catalog for
 * shared consumption. It deliberately carries no artifact catalog — the
 * essential-document list stays single-sourced in tmf-completeness.ts.
 *
 * DRIFT GUARD: server/services/__tests__/vault-taxonomy-etmf.test.ts asserts
 * this mirror matches the server catalogs (same 11 zone numbers, same names).
 * Change zones in etmf-logic.ts first; this file follows.
 *
 * @module shared/constants/domain/tmf-reference-model
 */

export interface TmfZoneRef {
  /** DIA RM zone number, 1–11 (matches tmf_artifacts.zone). */
  zone: number;
  /** Stable slug id for folder/rail use ('z01'..'z11'). */
  id: string;
  /** Zone name — verbatim from the server catalog (etmf-logic.ts). */
  name: string;
}

export const TMF_ZONE_REFS: TmfZoneRef[] = [
  { zone: 1,  id: 'z01', name: 'Trial Management' },
  { zone: 2,  id: 'z02', name: 'Central Trial Documents' },
  { zone: 3,  id: 'z03', name: 'Regulatory' },
  { zone: 4,  id: 'z04', name: 'IRB / IEC and Other Approvals' },
  { zone: 5,  id: 'z05', name: 'Site Management' },
  { zone: 6,  id: 'z06', name: 'IP and Trial Supplies' },
  { zone: 7,  id: 'z07', name: 'Safety Reporting' },
  { zone: 8,  id: 'z08', name: 'Central and Local Testing' },
  { zone: 9,  id: 'z09', name: 'Third Parties' },
  { zone: 10, id: 'z10', name: 'Data Management' },
  { zone: 11, id: 'z11', name: 'Statistics' },
];

export function tmfZoneById(id: string): TmfZoneRef | undefined {
  return TMF_ZONE_REFS.find(z => z.id === id);
}

export function tmfZoneByNumber(zone: number): TmfZoneRef | undefined {
  return TMF_ZONE_REFS.find(z => z.zone === zone);
}

export default { TMF_ZONE_REFS, tmfZoneById, tmfZoneByNumber };
