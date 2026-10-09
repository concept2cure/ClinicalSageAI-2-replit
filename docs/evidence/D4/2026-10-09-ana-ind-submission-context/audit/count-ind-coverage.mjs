/**
 * Read-only catalogue inventory. Run from the repository root:
 * node --import tsx docs/evidence/D4/2026-10-09-ana-ind-submission-context/audit/count-ind-coverage.mjs
 * No database, gateway, generation, or publication is invoked.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getAllINDSections, buildINDPackageDefinition } from '../../../../../services/regulatory/ind-ectd-sections.ts';
import { CTD_AUTHORING_GUIDANCE } from '../../../../../server/services/ind/ctd/authoring-guidance.ts';
import { ICH_M4_HEADINGS } from '../../../../../server/services/ind/ctd/ich-m4-headings.ts';
import { IND_SECTIONS, getSectionByCode } from '../../../../../server/services/ind/ind-section-registry.ts';
import { flattenModule1, requiredModule1 } from '../../../../../shared/regulatory/regional-module1.ts';
import { listProfiles, listAcceptedSlugs, getProfile } from '../../../../../server/services/ana/therapeutic-area-profiles/index.ts';
import { THERAPEUTIC_AREAS } from '../../../../../shared/constants/domain/therapeutic-areas.ts';
import { MODALITIES } from '../../../../../shared/regulatory/modality.ts';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const deep = getAllINDSections();
const packageDefinition = buildINDPackageDefinition();
const guidance = Object.values(CTD_AUTHORING_GUIDANCE);
const guidanceCodes = Object.keys(CTD_AUTHORING_GUIDANCE);
const headingCodes = ICH_M4_HEADINGS.map(row => row.code);
const recordCodes = [...guidanceCodes, ...headingCodes];
const terminalCodes = recordCodes.filter(code => !recordCodes.some(child => child.startsWith(`${code}.`)));
const profiles = listProfiles();
const regional = flattenModule1('US', 'ind');
const regionalCodes = regional.map(row => row.number);
const sources = [
  'services/regulatory/ind-ectd-sections.ts',
  'server/services/ind/ctd/authoring-guidance.ts',
  'server/services/ind/ctd/ich-m4-headings.ts',
  'server/services/ind/ind-section-registry.ts',
  'shared/regulatory/regional-module1.ts',
  'server/services/ana/therapeutic-area-profiles/index.ts',
  'shared/constants/domain/therapeutic-areas.ts',
  'shared/regulatory/modality.ts',
];
const moduleCounts = Object.fromEntries([1, 2, 3, 4, 5].map(module => [module, {
  deep_nodes: deep.filter(row => row.module === `M${module}`).length,
  deep_terminal_nodes: deep.filter(row => row.module === `M${module}` && !row.children?.length).length,
  deep_ai_draftable_terminal_nodes: deep.filter(row => row.module === `M${module}` && !row.children?.length && row.aiDraftable).length,
  legacy_registry_sections: IND_SECTIONS.filter(row => row.module === module).length,
  detailed_guidance_entries: guidance.filter(row => row.module === module).length,
  guidance_ind_necessity_tagged: guidance.filter(row => row.module === module && row.requiredFor.includes('IND')).length,
  structure_only_entries: ICH_M4_HEADINGS.filter(row => row.module === module).length,
  record_terminal_nodes: terminalCodes.filter(code => code.startsWith(String(module))).length,
  record_terminal_with_exact_guidance: terminalCodes.filter(code => code.startsWith(String(module)) && CTD_AUTHORING_GUIDANCE[code]).length,
  record_terminal_structure_only: terminalCodes.filter(code => code.startsWith(String(module)) && !CTD_AUTHORING_GUIDANCE[code]).length,
}]));

const inventory = {
  audited_at_utc: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
  runtime: process.version,
  reproduction: 'node --import tsx docs/evidence/D4/2026-10-09-ana-ind-submission-context/audit/count-ind-coverage.mjs',
  coverage_classes: {
    deep_node: 'Any node in the existing IND project bootstrap tree, including containers.',
    terminal_node: 'A code with no modeled descendants in its own catalogue; not automatically a submission document or a regulatory requirement.',
    counted_package_section: 'The builder counts terminal nodes plus nonterminal nodes with positive estimatedHours.',
    detailed_guidance: 'An exact CTD_AUTHORING_GUIDANCE record with authoring prose and content elements; not proof of current regulatory correctness or successful model execution.',
    structure_only: 'A heading in ICH_M4_HEADINGS without an exact detailed guidance record.',
    proven_execution: 'No live/model execution was performed in this inventory. Existing prompt and batch tests are separately cited in the audit conclusions.',
  },
  deep_ind: {
    nodes: deep.length,
    terminal_nodes: deep.filter(row => !row.children?.length).length,
    counted_package_sections: packageDefinition.totalSections,
    meaningful_nonterminal_nodes: deep.filter(row => row.children?.length && row.estimatedHours > 0).length,
    required_nodes: deep.filter(row => row.required).length,
    required_terminal_nodes: deep.filter(row => row.required && !row.children?.length).length,
    counted_required_package_sections: packageDefinition.requiredSections,
    ai_draftable_terminal_nodes: deep.filter(row => row.aiDraftable && !row.children?.length).length,
  },
  ctd_authoring_overlay: { entries: guidance.length, ind_necessity_tagged: guidance.filter(row => row.requiredFor.includes('IND')).length },
  ich_structure_only: { entries: ICH_M4_HEADINGS.length },
  overlay_plus_ich_headings: {
    entries: recordCodes.length,
    duplicate_codes: guidanceCodes.filter(code => headingCodes.includes(code)),
    terminal_nodes: terminalCodes.length,
    terminal_with_exact_guidance: terminalCodes.filter(code => CTD_AUTHORING_GUIDANCE[code]).length,
    terminal_structure_only: terminalCodes.filter(code => !CTD_AUTHORING_GUIDANCE[code]).length,
  },
  by_module: moduleCounts,
  us_ind_regional_module1: {
    nodes: regional.length,
    terminal_nodes: regionalCodes.filter(code => !regionalCodes.some(child => child.startsWith(`${code}.`))).length,
    exact_overlay_guidance_matches: regionalCodes.filter(code => CTD_AUTHORING_GUIDANCE[code]).length,
    standing_without_client_facts: requiredModule1('US', 'ind', {}),
  },
  therapeutic_profiles: {
    canonical_areas: THERAPEUTIC_AREAS.length,
    distinct_profiles: profiles.length,
    accepted_slugs: listAcceptedSlugs().length,
    unresolved_canonical_areas: THERAPEUTIC_AREAS.filter(area => !getProfile(area.value)).map(area => area.value),
    context_rule_entries: profiles.reduce((sum, profile) => sum + profile.contextRules.length, 0),
    guidance_reference_entries: profiles.reduce((sum, profile) => sum + profile.guidanceRefs.length, 0),
    profile_ids: profiles.map(profile => profile.id),
  },
  modalities: { count: MODALITIES.length, values: MODALITIES },
  legacy_generate_section: {
    accepted_legacy_sections: IND_SECTIONS.length,
    exact_overlay_matches: guidance.filter(row => getSectionByCode(row.code)).length,
    exact_overlay_rejected_by_legacy_lookup: guidance.filter(row => !getSectionByCode(row.code)).length,
    limitation: 'This route remains mounted, but the ind_generate_section and ind_get_status AnA tools are retired. Canonical AnA drafting uses batch_draft_sections and draft_authoring_document.',
  },
  limitations: [
    'The overlay-plus-headings counts cover the FDA IND/NDA/BLA lifecycle record, not an approved IND-specific required-leaf manifest.',
    'The regional Module 1 catalogue is separate from the ICH Modules 2–5 structural record; its rows include multi-document placement headings such as Forms.',
    'requiredFor is a necessity flag, not conditional applicability. Optional IND content can lack an IND tag.',
    'No disease-by-modality-by-section execution matrix, live model generation, scientific qualification, or regulator completeness assessment was run.',
    'The M3 heading record intentionally lacks deeper CMC subdivisions, and nonclinical table numbers are not modeled.',
  ],
  source_pins: sources.map(relativePath => {
    const bytes = readFileSync(new URL(`../../../../../${relativePath}`, import.meta.url));
    return { path: relativePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }),
};
process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
