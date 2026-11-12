/**
 * The TMF Reference Model catalog — the ONE copy in this repository.
 *
 * The 11 DIA TMF Reference Model zones and the 41 artifacts (26 essential)
 * this platform files and assesses, each with its stable code, its
 * name, its zone and whether it is an essential record (ICH E6(R3) Appendix C).
 * Client-safe: no server imports.
 *
 * Read by:
 *   - server/services/etmf/tmf-completeness.ts — inspection-readiness
 *     assessment, GET /api/etmf/reference-model
 *   - server/services/etmf/etmf-logic.ts — zone names and the artifact
 *     classifier (catalog names and codes first, keyword rules after)
 *   - shared/constants/domain/vault-taxonomy.ts — the service view's zone folders
 *   - server/services/vault/vault-filing.service.ts — zone → folder id
 *   - client/src/concept2cure/v2/surfaces/Etmf.tsx — artifact names
 *   - server/services/gcp-operations/gcp-operations-reference.ts — the zone
 *     each essential document is filed in, and the TMF structure AnA's
 *     plan_essential_documents returns
 *
 * Until 2026-10-30 (docs/design/ETMF_CONVERGENCE_2026-10-30.md, slice E1) this
 * file was a zone-level mirror, the full catalog lived in tmf-completeness.ts
 * and again in the client's fixtures/etmf.ts, and etmf-logic.ts kept its own
 * zone list; zone 4 was spelled "Other" here and in etmf-logic.ts, "other" in
 * the two full catalogs. The content below is tmf-completeness.ts's, verbatim
 * (zone 4 included); etmf-logic.ts and tmf-completeness.ts import it and the
 * client copy is deleted. E1 left the seven "abridged" zones in
 * server/services/gcp-operations/gcp-operations-reference.ts as they were; its
 * review (2026-11-10) found AnA returning them as the TMF's structure, so they
 * are deleted too and that library names zones of this catalog by number.
 *
 * DRIFT GUARD: server/services/__tests__/vault-taxonomy-etmf.test.ts requires
 * the server catalog to be this object, zone numbers and names to agree in
 * every consumer, no other tracked source file to spell out the catalog or
 * declare a zone list, and the essential-documents library to sit in its zones.
 *
 * Reference: DIA Trial Master File Reference Model v3.x (zone/artifact taxonomy);
 * ICH E6(R3) Appendix C (Essential Records for the Conduct of a Clinical Trial).
 *
 * @module shared/constants/domain/tmf-reference-model
 */

export interface TmfArtifact {
  /** Stable artifact code (e.g. 'protocol'); the key a filing is stored under. */
  code: string;
  name: string;
  /** Whether the artifact is an essential document (drives default readiness). */
  essential: boolean;
}

export interface TmfZone {
  /** Zone number (1–11). */
  number: number;
  name: string;
  artifacts: TmfArtifact[];
}

/** The DIA TMF Reference Model zones with their artifacts. */
export const TMF_REFERENCE_MODEL: TmfZone[] = [
  {
    number: 1,
    name: 'Trial Management',
    artifacts: [
      { code: 'tmf_plan', name: 'Trial Master File Plan', essential: true },
      { code: 'monitoring_plan', name: 'Monitoring Plan', essential: true },
      { code: 'recruitment_plan', name: 'Recruitment Plan', essential: false },
      { code: 'communication_plan', name: 'Communication Plan', essential: false },
      { code: 'risk_management_plan', name: 'Risk Management Plan', essential: false },
    ],
  },
  {
    number: 2,
    name: 'Central Trial Documents',
    artifacts: [
      { code: 'protocol', name: 'Protocol and amendments', essential: true },
      { code: 'investigators_brochure', name: "Investigator's Brochure", essential: true },
      { code: 'sample_crf', name: 'Sample Case Report Form', essential: true },
      { code: 'sample_icf', name: 'Sample Informed Consent Form', essential: true },
      { code: 'insurance', name: 'Insurance / indemnity', essential: false },
    ],
  },
  {
    number: 3,
    name: 'Regulatory',
    artifacts: [
      { code: 'regulatory_submission', name: 'Regulatory submission', essential: true },
      { code: 'regulatory_approval', name: 'Regulatory approval / authorisation', essential: true },
      { code: 'import_export_license', name: 'Import/export license', essential: false },
    ],
  },
  {
    number: 4,
    name: 'IRB / IEC and other Approvals',
    artifacts: [
      { code: 'irb_submission', name: 'IRB/IEC submission', essential: true },
      { code: 'irb_approval', name: 'IRB/IEC approval', essential: true },
      { code: 'irb_composition', name: 'IRB/IEC composition / roster', essential: true },
    ],
  },
  {
    number: 5,
    name: 'Site Management',
    artifacts: [
      { code: 'site_signature_sheet', name: 'Site signature/delegation log', essential: true },
      { code: 'investigator_cv', name: 'CV of the investigator', essential: true },
      { code: 'financial_disclosure', name: 'Financial disclosure form', essential: true },
      { code: 'site_training_records', name: 'Site training records', essential: false },
      { code: 'subject_log', name: 'Subject screening/enrolment log', essential: false },
    ],
  },
  {
    number: 6,
    name: 'IP and Trial Supplies',
    artifacts: [
      { code: 'ip_accountability', name: 'IP accountability records', essential: true },
      { code: 'ip_shipment', name: 'IP shipment records', essential: true },
      { code: 'ip_storage_temp', name: 'IP storage temperature records', essential: false },
      { code: 'ip_destruction', name: 'IP destruction records', essential: false },
    ],
  },
  {
    number: 7,
    name: 'Safety Reporting',
    artifacts: [
      { code: 'safety_management_plan', name: 'Safety Management Plan', essential: true },
      { code: 'sae_reports', name: 'SAE reports', essential: true },
      { code: 'susar_reports', name: 'SUSAR reports', essential: true },
      { code: 'safety_reports_to_irb', name: 'Safety report submissions to IRB/IEC', essential: false },
    ],
  },
  {
    number: 8,
    name: 'Central and Local Testing',
    artifacts: [
      { code: 'lab_certification', name: 'Laboratory certification/accreditation', essential: true },
      { code: 'lab_normal_ranges', name: 'Laboratory normal ranges', essential: true },
      { code: 'lab_manual', name: 'Laboratory manual', essential: false },
    ],
  },
  {
    number: 9,
    name: 'Third Parties',
    artifacts: [
      { code: 'vendor_contract', name: 'Vendor/CRO contract', essential: true },
      { code: 'vendor_qualification', name: 'Vendor qualification', essential: false },
      { code: 'vendor_oversight', name: 'Vendor oversight documentation', essential: false },
    ],
  },
  {
    number: 10,
    name: 'Data Management',
    artifacts: [
      { code: 'data_management_plan', name: 'Data Management Plan', essential: true },
      { code: 'crf_completion_guidelines', name: 'CRF completion guidelines', essential: false },
      { code: 'database_lock', name: 'Database lock documentation', essential: true },
    ],
  },
  {
    number: 11,
    name: 'Statistics',
    artifacts: [
      { code: 'sap', name: 'Statistical Analysis Plan', essential: true },
      { code: 'randomization_plan', name: 'Randomization plan', essential: false },
      { code: 'statistical_report', name: 'Statistical report', essential: true },
    ],
  },
];

/** The artifact a code names, with the zone it sits in; undefined for a code the catalog does not hold. */
export function tmfArtifactByCode(code: string): { zone: TmfZone; artifact: TmfArtifact } | undefined {
  for (const zone of TMF_REFERENCE_MODEL) {
    const artifact = zone.artifacts.find((a) => a.code === code);
    if (artifact) return { zone, artifact };
  }
  return undefined;
}

/** An artifact code's catalog name; a code the catalog does not hold is shown as itself, never renamed. */
export function tmfArtifactName(code: string): string {
  return tmfArtifactByCode(code)?.artifact.name ?? code;
}

// ─── Zone references (folder / rail use) ─────────────────────────────────────

export interface TmfZoneRef {
  /** DIA RM zone number, 1–11 (matches tmf_artifact_filings.zone_number). */
  zone: number;
  /** Stable slug id for folder/rail use ('z01'..'z11'). */
  id: string;
  /** Zone name, from TMF_REFERENCE_MODEL. */
  name: string;
}

export const TMF_ZONE_REFS: TmfZoneRef[] = TMF_REFERENCE_MODEL.map((z) => ({
  zone: z.number,
  id: `z${String(z.number).padStart(2, '0')}`,
  name: z.name,
}));

export function tmfZoneById(id: string): TmfZoneRef | undefined {
  return TMF_ZONE_REFS.find(z => z.id === id);
}

export function tmfZoneByNumber(zone: number): TmfZoneRef | undefined {
  return TMF_ZONE_REFS.find(z => z.zone === zone);
}

export default { TMF_REFERENCE_MODEL, TMF_ZONE_REFS, tmfZoneById, tmfZoneByNumber, tmfArtifactByCode, tmfArtifactName };
