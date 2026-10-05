/**
 * Device & IVD submission assembly contract (Device Slice 1, B5).
 *
 * The single, honest orchestration spine for assembling a device/IVD submission.
 * It ties together the pieces that already exist as isolated modules:
 *   - eSTAR section readiness   (estar-mapper.mapToEstar — 510(k) / De Novo)
 *   - PMA module readiness      (pma-mapper.mapToPma — 21 CFR 814, pathway 'pma')
 *   - official template gate    (estar-template-registry.assessEstarTemplateReadiness)
 *   - target-market readiness   (global-markets.assessMarketReadiness)
 *
 * It does NOT render or transmit anything here — it computes WHAT can honestly be
 * produced and WHAT blocks a submittable artifact, mirroring the eCTD dispatch-gate
 * discipline. The decisive, honesty-preserving output is `artifactKind`:
 *   - 'official-estar'        → eSTAR sections complete AND the official FDA template
 *                               is available to fill (via forms/fill-official-pdf, B3/B4)
 *   - 'content-package-draft' → content exists but no official template ⇒ only the
 *                               loose section-PDF ZIP is producible (NOT submittable)
 *   - 'none'                  → required content missing; nothing to assemble
 *
 * `assembleDeviceSubmission` is pure + deterministic + honest-by-construction:
 * no DB, no network, no LLM, no rendering. Never claims a submittable eSTAR it
 * cannot actually produce.
 *
 * `assembleProgramDeviceSubmission` is the ONE place its inputs are loaded for a
 * real organization/program — the authored content (governed document, else the
 * legacy store, and which one answered), the program's intake device answers,
 * and the checksum-verified vendored templates (`loadProgramDeviceAssemblyInput`
 * is the loader; `assembleProgramDeviceSubmission` is loader + engine). POST
 * /api/510k/estar/assemble and the assemble_device_submission and
 * advise_device_readiness AnA tools all read through that loader, so the
 * verdict a user sees on the page and the one AnA states cannot diverge, and
 * none is ever computed from content a caller merely asserts. Its loaders are
 * imported lazily so this module still loads without a database.
 *
 * @module server/services/pathway-engines/device-assembly/assemble-device-submission
 */

import { mapToEstar, type EstarType, type EstarInputLeaf, type EstarResult, type DeviceFlags } from '../estar/estar-mapper';
import { mapToPma, type PmaResult, type PmaSubmissionType } from '../pma/pma-mapper';
import {
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
  type EstarTemplateReadinessResult,
} from '../estar/estar-template-registry';
import { tryAssessMarketReadiness } from '../../global-markets/market-readiness';
import type { MarketId, MarketReadinessResult } from '../../global-markets/types';
import type { DeviceContentClient, DeviceContentSource } from '../estar/estar-content-leaves';
import { DEVICE_FLAGS } from '../../../../shared/constants/domain/device-classification';

export type DeviceArtifactKind = 'official-estar' | 'content-package-draft' | 'none';

/**
 * The FDA device pathways this contract assembles. All three are filed on the
 * nIVD/IVD eSTAR (the template registry carries pma-device / pma-ivd); what
 * differs is the section registry the content is scored against — the eSTAR
 * slots for 510(k)/De Novo, the 21 CFR 814 modules for a PMA. (EU MDR/IVDR
 * technical documentation is a separate contract.)
 */
export type DeviceAssemblyPathway = EstarType | 'pma';

/** Section readiness for the pathway: eSTAR slots, or the PMA modules. */
export type DeviceSectionReadiness = EstarResult | PmaResult;

export interface AssembleDeviceSubmissionInput {
  /** FDA device pathway — selects the readiness registry and the template descriptor. */
  pathway: DeviceAssemblyPathway;
  /**
   * For pathway 'pma': original application vs a supplement/notice (21 CFR
   * 814.39), which scopes the modules a filing owes. Defaults to 'original'.
   * Ignored for 510(k) / De Novo.
   */
  pmaSubmissionType?: PmaSubmissionType;
  /** Device vs IVD selects the official template variant. */
  variant: EstarTemplateVariant;
  /** Canonical content leaves to project onto the eSTAR section tree. */
  leaves: EstarInputLeaf[];
  /** Official eSTAR template filenames present in the drop-point (from listVendoredTemplates). */
  presentTemplates?: string[];
  /** Target market for a market-readiness overlay (optional). */
  market?: MarketId;
  /** Artifact ids available, for the market-readiness overlay. */
  availableArtifacts?: string[];
  /** Build environment — production gates the template requirement. */
  environment?: 'staging' | 'production';
  /** Override the ESTAR_REQUIRE_TEMPLATE flag (defaults to the env reader). */
  requireTemplate?: boolean;
  /**
   * The device's answers to the seven intake flags. Sections that are required
   * only for some devices (sterilization, software, cybersecurity) cannot be
   * judged without them, and an unjudged section blocks readiness rather than
   * being scored as satisfied (W1-5).
   */
  deviceFlags?: DeviceFlags;
}

export interface AssembleDeviceSubmissionResult {
  pathway: DeviceAssemblyPathway;
  variant: EstarTemplateVariant;
  /** What can honestly be produced for this input. */
  artifactKind: DeviceArtifactKind;
  /** True only when sections are complete AND the official template is available. */
  canProduceOfficialEstar: boolean;
  /**
   * Section readiness on the pathway's own registry. Named `estar` because
   * every pathway here is filed on the eSTAR; for 'pma' the sections are the
   * 21 CFR 814 modules (PmaResult), never the 510(k) slots.
   */
  estar: DeviceSectionReadiness;
  template: EstarTemplateReadinessResult;
  market?: MarketReadinessResult;
  /** Aggregated, de-duplicated blockers preventing a submittable official eSTAR. */
  blockers: string[];
  provenance: {
    generatedAt: string;
    modules: string[];
  };
}

/**
 * Compute the honest assembly state for a device/IVD eSTAR submission. Decides
 * the producible artifact kind and surfaces every blocker; it never fabricates a
 * submittable eSTAR when the official template is missing or sections are incomplete.
 */
export function assembleDeviceSubmission(
  input: AssembleDeviceSubmissionInput,
): AssembleDeviceSubmissionResult {
  const environment = input.environment ?? 'staging';
  const requireTemplate = input.requireTemplate ?? estarTemplateRequiredFromEnv();

  const estar: DeviceSectionReadiness =
    input.pathway === 'pma'
      ? mapToPma({ leaves: input.leaves, submissionType: input.pmaSubmissionType })
      /* The variant reaches the slot registry, not only the template check
         below. Without it an IVD 510(k) was scored against the nIVD slot set
         and never asked for analytical performance. */
      : mapToEstar({ leaves: input.leaves, type: input.pathway, flags: input.deviceFlags, variant: input.variant === 'ivd' ? 'ivd' : 'device' });

  const template = assessEstarTemplateReadiness({
    type: input.pathway,
    variant: input.variant,
    present: input.presentTemplates ?? [],
    environment,
    requireTemplate,
  });

  // tryAssessMarketReadiness returns null for an unknown market; normalize to
  // undefined so the result field stays `MarketReadinessResult | undefined`.
  const market = input.market
    ? (tryAssessMarketReadiness(input.market, input.availableArtifacts ?? []) ?? undefined)
    : undefined;

  const blockers: string[] = [];

  // Section completeness blockers. For a 510(k) or De Novo this is the
  // attachment half of FDA's eSTAR technical screening (eSTARs are not expected
  // to go through refuse-to-accept); for a PMA it is the filing review of the
  // 21 CFR 814 modules.
  if (estar.summary.missingRequired.length > 0) {
    blockers.push(
      `${estar.summary.missingRequired.length} required eSTAR section(s) missing: ` +
        `${estar.summary.missingRequired.join(', ')}.`,
    );
  }

  // Sections whose applicability nobody has established. The eSTAR mapper
  // reports them separately from missingRequired and already folds them into
  // summary.ready; this consumer recomputed readiness from missingRequired
  // alone, so a sterile, software-bearing, network-connected device with none
  // of that documentation — and no deviceFlags supplied, which no route caller
  // does — was reported canProduceOfficialEstar with an empty error list. A
  // submission FDA would not accept reported as a submittable eSTAR.
  const undetermined = 'undetermined' in estar.summary ? estar.summary.undetermined : [];
  if (undetermined.length > 0) {
    blockers.push(
      `${undetermined.length} eSTAR section(s) whose applicability is not established: ` +
        `${undetermined.join(', ')}. Answer the device questions (sterile, software, ` +
        `connected, implant, combination product) so the required set is known.`,
    );
  }

  // The accuracy half of the eSTAR technical screening: a device question
  // answered "no" while the authored content says otherwise. FDA checks that
  // the eSTAR's responses accurately describe the device and can hold one that
  // does not; the mapper folds these into summary.ready, and this names them.
  const contradictions = 'contradictions' in estar.summary ? estar.summary.contradictions : [];
  if (contradictions.length > 0) {
    const detail = contradictions
      .map((c) => {
        const question = DEVICE_FLAGS.find((f) => f.id === c.flag)?.label ?? c.flag;
        return `${c.section} (answered "${question}: no", but authored in ${c.sources.join(', ')})`;
      })
      .join('; ');
    blockers.push(
      `${contradictions.length} device answer(s) contradict the authored content, which FDA's eSTAR ` +
        `technical screening checks: ${detail}. Correct the answer, or remove the section if it only ` +
        `records that it does not apply.`,
    );
  }

  // Official-template blockers (cannot produce the artifact CDRH ingests).
  for (const b of template.blockers) blockers.push(b);

  // Market overlay blockers (honest about transmit/assemble gaps).
  if (market) for (const b of market.blockers) blockers.push(b);

  // The mapper's own verdict: no required section missing, no section
  // undetermined AND no contradicted answer. Never recomputed here from part of it.
  const sectionsComplete = estar.summary.ready;
  const canProduceOfficialEstar = sectionsComplete && template.available;

  let artifactKind: DeviceArtifactKind;
  if (canProduceOfficialEstar) {
    artifactKind = 'official-estar';
  } else if (input.leaves.length > 0) {
    // We have content but cannot produce the official eSTAR — only the loose
    // section-PDF draft package is producible, which is NOT submittable.
    artifactKind = 'content-package-draft';
  } else {
    artifactKind = 'none';
  }

  // De-duplicate blockers while preserving order.
  const dedupedBlockers = Array.from(new Set(blockers));

  return {
    pathway: input.pathway,
    variant: input.variant,
    artifactKind,
    canProduceOfficialEstar,
    estar,
    template,
    market,
    blockers: dedupedBlockers,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: [
        input.pathway === 'pma' ? 'pathway-engines/pma/pma-mapper' : 'pathway-engines/estar/estar-mapper',
        'pathway-engines/estar/estar-template-registry',
        ...(market ? ['global-markets/market-readiness'] : []),
      ],
    },
  };
}

/** What a program-scoped assembly reads, besides the organization. */
export interface AssembleProgramDeviceSubmissionInput {
  /** The regulatory program whose GOVERNED device document to read (falls back to the legacy store when it holds no authored content). */
  programId?: string;
  /** Narrow a LEGACY-store read to one document's sections. */
  documentId?: number;
  pathway: DeviceAssemblyPathway;
  pmaSubmissionType?: PmaSubmissionType;
  variant: EstarTemplateVariant;
  market?: MarketId;
  /**
   * Device answers stated by an authenticated caller of the HTTP route; when
   * absent, the program's intake answers are used. The AnA tool never passes
   * this: the model's channel is not a source of device facts.
   */
  deviceFlags?: DeviceFlags;
  /** Query client for the governed store (defaults to the shared pool). */
  client?: DeviceContentClient;
}

export type AssembleProgramDeviceSubmissionResult = AssembleDeviceSubmissionResult & {
  /** Which store answered the content load — 'legacy_org_wide' is NOT the program's own document. */
  deviceContentSource: DeviceContentSource;
};

/** The engine input for one organization/program, as the server loaded it, and which store answered. */
export interface ProgramDeviceAssemblyInput {
  assemblyInput: AssembleDeviceSubmissionInput;
  /** Which store answered the content load — 'legacy_org_wide' is NOT the program's own document. */
  deviceContentSource: DeviceContentSource;
}

/**
 * Load, server-side, everything {@link assembleDeviceSubmission} needs for a
 * program: the authored content (substantive derived from each section's
 * status), the intake device answers, and the checksum-verified templates.
 * Callers that only need the verdict use {@link assembleProgramDeviceSubmission};
 * the AnA advisory (adviseDeviceReadiness) shapes the same input into advice.
 *
 * A failed read THROWS — it is never turned into "no content", which would
 * report every section as missing to a sponsor who has written them. The
 * caller reports the failure (the route answers 500; the AnA tools answer
 * read_failed).
 */
export async function loadProgramDeviceAssemblyInput(
  organizationId: number,
  input: AssembleProgramDeviceSubmissionInput,
): Promise<ProgramDeviceAssemblyInput> {
  const [{ resolveDeviceContentScope, loadDeviceContentLeaves }, { loadProgramDeviceFlags }, { listVendoredTemplates, isUsableEstarTemplate }] =
    await Promise.all([
      import('../estar/estar-content-leaves'),
      import('../estar/program-device-flags'),
      import('../estar/estar-template-registry'),
    ]);

  const { scope, source } = await resolveDeviceContentScope(organizationId, {
    programId: input.programId,
    documentId: input.documentId,
    client: input.client,
  });
  const [leaves, vendored] = await Promise.all([
    loadDeviceContentLeaves(organizationId, scope),
    listVendoredTemplates(),
  ]);

  // The device questions the program answered at intake. Without them every
  // conditional section is undetermined and no program can report a
  // producible official eSTAR.
  const anchorProgramId = scope.programId ?? input.programId;
  const storedDeviceFlags = anchorProgramId ? await loadProgramDeviceFlags(organizationId, anchorProgramId) : undefined;

  return {
    assemblyInput: {
      pathway: input.pathway,
      pmaSubmissionType: input.pmaSubmissionType,
      variant: input.variant,
      leaves,
      // A caller-stated answer wins; the program's intake answers are the fallback.
      deviceFlags: input.deviceFlags ?? storedDeviceFlags,
      /* By NAME was the bug: a file called eSTAR-510k-non-ivd.pdf whose bytes do
         not match checksums.txt counted as present, so /assemble answered
         "official eSTAR producible · 0 blockers" for a template the fill behind
         the Generate button then refuses. Availability is the same question in
         both places, so it gets the same answer. */
      presentTemplates: vendored.filter(isUsableEstarTemplate).map((t) => t.fileName),
      market: input.market,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'staging',
    },
    deviceContentSource: source,
  };
}

/**
 * Assemble from what the organization has actually authored, server-side:
 * {@link loadProgramDeviceAssemblyInput} then {@link assembleDeviceSubmission}.
 * A failed read throws (see the loader).
 */
export async function assembleProgramDeviceSubmission(
  organizationId: number,
  input: AssembleProgramDeviceSubmissionInput,
): Promise<AssembleProgramDeviceSubmissionResult> {
  const { assemblyInput, deviceContentSource } = await loadProgramDeviceAssemblyInput(organizationId, input);
  return { ...assembleDeviceSubmission(assemblyInput), deviceContentSource };
}

export default { assembleDeviceSubmission, assembleProgramDeviceSubmission, loadProgramDeviceAssemblyInput };
