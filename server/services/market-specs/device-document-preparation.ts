/** Device inquiry for the existing document preparation contract. These are
 * platform planning prompts, not agency requirements or evidence assessments. */
import type { DocumentPreparationScope, PreparationQuestion, PreparationTopic } from './document-preparation';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy';

export const DEVICE_DRAFTING_GUIDANCE = `DEVICE AND DIAGNOSTICS EVIDENCE-BASED DRAFTING:
Draft only from supplied current device, assay and software versions and the selected section requirements. Keep intended use, intended population, classification rationale, configurations, source versions and approved changes traceable. Use analytical and clinical performance, verification/validation, risk controls, manufacturing and software/cybersecurity evidence only where applicable. Use deterministic outputs for numbers; never invent test results, predicates, equivalence, standards conformity or approval. Preserve adverse, contradictory and unresolved findings and their source/version references.
If a decisive fact or source is absent or contradictory, leave an explicit unresolved placeholder. Keep preparation questions outside the formal document; the client interview occurs in conversation before this section drafting task. Do not claim to have called tools, read files not supplied, saved a document, performed expert review, validated a package or transmitted to an authority. Draft, review, approval, an official technical artifact and agency submission remain separate.
Confirm the target jurisdiction, applicable device/IVD procedure, receiving body, local representative, language and current agency/client template. EU technical documentation, performance studies and medicinal-product consultations have different recipients; do not substitute EMA or an eCTD pathway for device conformity assessment. This drafting task does not transmit any filing.`;

const q = (topic: PreparationTopic, question: string, why: string, requestedEvidence: string): PreparationQuestion => ({ topic, question, why, requestedEvidence });
const DEVICE_QUESTIONS: Record<PreparationTopic, PreparationQuestion> = {
  scope: q('scope', 'Which device or diagnostic, intended use, intended population, configuration and target regional procedure does this document serve, and what classification facts remain unconfirmed?', 'Intended purpose and factual classification determine the evidence and receiving body; a document title does not establish eligibility.', 'Confirmed project and device/assay identity, intended use, users/population, model/configuration, classification rationale and actual filing objective.'),
  source_versions: q('source_versions', 'Which current device, assay, software and manufacturing source versions govern this draft, and which changed or superseded records need reconciliation?', 'Evidence from different configurations cannot silently be combined into a single current claim.', 'Device/assay/software versions and configuration history, source reports, design inputs, approved changes and correspondence with dates and source locations.'),
  data_cutoff: q('data_cutoff', 'What reporting interval, data cutoff and completeness/reconciliation status apply to these device or performance data?', 'Interim or unreconciled evidence cannot silently become a final validation or surveillance conclusion.', 'Dated cutoff, database lock where applicable, reconciliation logs, outstanding queries and interval versus cumulative source definitions.'),
  statistical_results: q('statistical_results', 'Which analytical and clinical performance or verification/validation results support each intended-use claim, including failures, uncertainty and contradictory findings?', 'Performance claims require traceable methods, acceptance criteria and actual results; a scaffold cannot establish conformity.', 'Approved test/study protocols, representative configurations/specimens, prespecified acceptance criteria, analytical and clinical performance reports, denominators, confidence intervals, deviations and deterministic analysis outputs.'),
  estimands: q('estimands', 'Which clinical investigation or performance-study objectives, endpoints, analysis populations, reference standards and missing-data methods were prespecified?', 'A diagnostic or device study must answer its intended-use question using its approved design and analysis.', 'Current investigation/performance-study protocol and analysis plan, comparator/reference-standard rationale, sample-size calculations, endpoint definitions and documented deviations.'),
  safety: q('safety', 'Which hazards, hazardous situations, risk controls, residual risks and benefit-risk findings apply, and what adverse events or device deficiencies remain unresolved?', 'Risk controls and actual safety findings must remain linked to the tested configuration and intended use.', 'Current risk management file, hazard analyses, control verification, benefit-risk evaluation, safety/deficiency records and accountable clinical or engineering review.'),
  quality: q('quality', 'Which manufacturing, design verification, stability, specimen handling and quality-system records apply, including software/cybersecurity, sterilization or biocompatibility when relevant?', 'Applicable evidence depends on the actual device and assay; missing facts must not become a conclusion that testing is unnecessary.', 'Design/manufacturing and quality-system records, versioned verification/validation, shelf-life/specimen stability, and applicable software lifecycle, cybersecurity/SBOM, sterilization or biocompatibility evidence.'),
  local_requirements: q('local_requirements', 'Which current regional forms, receiving body, local representative or authorization holder, languages, labeling and ethics or site requirements apply?', 'Device conformity assessment, clinical investigations and diagnostic studies have different local recipients and obligations.', 'Current authority/notified-body/client instructions, local-representative records, required language/labeling variants and ethics/site decisions where applicable.'),
  japan_evidence: q('japan_evidence', 'Which Japanese device or diagnostic data, population/use-context or specimen evidence and foreign-data acceptance rationale are available, and what consultation decisions apply?', 'Additional Japanese evidence is not automatically required or waived; assess the device, intended use and applicable authority advice.', 'Japanese and foreign device/performance evidence, use-context/specimen comparability assessment, Japanese-language source requirements and recorded PMDA/MHLW or certification-body advice as applicable.'),
  agency_commitments: q('agency_commitments', 'Which authority, notified-body or certification-body questions, deficiencies, agreed advice and commitments must this draft answer?', 'The response must address the actual requested issue without treating a draft as an accepted remedy.', 'Current correspondence and agreed minutes, question/response matrix, source-linked remedies and accountable regulatory review.'),
  review_owners: q('review_owners', 'Who owns the applicable clinical/performance, engineering, software, risk, quality and regional regulatory reviews, and which evidence gaps prevent approval?', 'AnA drafting, expert review, signature, technical validation and submission are separate steps.', 'Named accountable reviewers, access/roles, evidence-gap list and applicable review and approval records.'),
};

function euDeviceChannel(entry: RegulatoryApplicationType | undefined): string {
  if (entry?.id === 'EU_IVDR_ART48_CONSULT') return 'Notified Body consultation with EMA / the relevant medicines authority';
  if (entry?.agency === 'National_Competent_Authority' || entry?.applicationFamily === 'clinical_trial') return 'Applicable national competent authority and ethics review';
  if (entry?.agency === 'EU_Reference_Laboratory') return 'Applicable EU reference laboratory';
  if (['EU_MDR_CLASS_I', 'EU_IVDR_CLASS_A', 'EU_DOC'].includes(entry?.id ?? '')) return 'Manufacturer conformity documentation; confirm any Notified Body involvement';
  return 'Applicable Notified Body / national competent authority';
}

function deviceRoute(scope: DocumentPreparationScope) {
  const { entry, market } = scope;
  const basis = { ref: 'Existing device/diagnostics filing registry and platform authoring plan; current regional procedure must be confirmed.', confidence: 'platform-convention' as const };
  if (entry?.applicationFamily === 'quality_system') {
    return { channel: 'Internal device quality-system preparation', scope: 'Prepare controlled quality-system working records and source references. Obtain original independent audit, certification, production and release records where applicable. This is not an agency filing route, an approved QMS document, a signed record or transmission.', basis };
  }
  if (!market) return null;
  if (market === 'EU') {
    return { channel: euDeviceChannel(entry), scope: 'Prepare the applicable MDR/IVDR device documents and confirm the recipient and procedure. This plan does not transmit to a Notified Body, national authority or EMA; submit through the recipient\'s specified channel.', basis };
  }
  if (market === 'CA') return { channel: 'Health Canada device / IVD document preparation', scope: 'Confirm the class, licence or investigational procedure, current forms and Canadian representative/language requirements. No Health Canada transmission is available through this preparation plan; use the authority\'s specified channel.', basis };
  if (market === 'JP') return { channel: 'Japan device / IVD document preparation: confirm PMDA/MHLW or registered certification body procedure', scope: 'Confirm approval, certification or notification applicability, authorization holder, language and device/performance evidence. No Japanese agency transmission is available through this preparation plan; use the applicable authority or certification-body channel.', basis };
  return { channel: 'FDA device / diagnostics document preparation', scope: 'Confirm the exact device pathway and current official form/eSTAR or other required technical artifact. This plan does not transmit to FDA or establish that an official package can be produced or accepted.', basis };
}

export function buildDeviceDocumentPreparation(scope: DocumentPreparationScope, discussedTopics: PreparationTopic[]) {
  const family = scope.entry?.applicationFamily;
  const focus: PreparationTopic[] = family === 'pre_submission' ? ['agency_commitments', 'safety', 'quality']
    : family === 'software_documentation' || family === 'quality_system' ? ['quality', 'safety']
      : family === 'clinical_trial' || family === 'clinical_document' ? ['estimands', 'statistical_results', 'safety', 'quality']
        : family === 'post_market' ? ['data_cutoff', 'safety', 'statistical_results', 'quality']
          : ['statistical_results', 'safety', 'quality'];
  const topics = [...new Set<PreparationTopic>(['scope', 'source_versions', ...focus,
    'agency_commitments', 'local_requirements', ...(scope.market === 'JP' ? ['japan_evidence' as const] : []), 'review_owners'])];
  const remaining = topics.filter(topic => !discussedTopics.includes(topic));
  return {
    kind: 'document_preparation' as const, readiness: 'not_assessed' as const, evidenceReviewed: false as const,
    registryId: scope.entry?.id ?? null, market: scope.market ?? null, regionalRoute: deviceRoute(scope),
    questions: remaining.slice(0, 3).map(topic => ({ ...DEVICE_QUESTIONS[topic] })), remainingTopics: remaining.slice(3), discussedTopics,
    discussionNotice: 'Discussion markers only prevent repeat questions. They do not verify answers, evidence, review approval or filing readiness. Read current project sources first and revisit topics when document, source versions or filing scope change.',
    applicabilityQuestions: [
      'Confirm device versus IVD/CDx/software scope, intended use, classification facts and regional procedure; no classification or route is inferred from a template.',
      'Determine clinical/performance, risk, software/cybersecurity, electrical, sterilization, biocompatibility, manufacturing and post-market evidence applicability from current product facts.',
      'For companion diagnostics and combination products, confirm the linked therapeutic product, version and applicable consultation or co-development obligations.',
    ],
    cautions: [
      'The scaffold is not a current official agency template, a complete regional requirement set, verified evidence or a filing-readiness verdict.',
      'Retain original forms, raw data, test reports, certificates, signed records and official technical artifacts; narrative authoring does not replace them.',
      'Confirm current standards, regional adoption, language, recipient and official format with the applicable authority/notified body and accountable reviewers.',
      ...(scope.market === 'JP' ? ['Japanese studies or a language exemption are not automatically required or granted; confirm device-specific requirements and recorded advice.'] : []),
    ],
    regionalEvidenceSources: [],
    reviewGates: [
      'Read and cite current source versions; resolve contradictory and superseded evidence without deleting lineage.',
      'Use deterministic test and analysis outputs; retain acceptance criteria, failures and uncertainty.',
      'Independent clinical/performance, engineering, software, risk, quality and regulatory review as applicable.',
      'Save through draft_authoring_document; approval, official package validation and agency transmission remain separate.',
    ],
  };
}
