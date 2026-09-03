/**
 * Module 3 Narrative Extension — Coverage tests for new ICH M4Q sections
 *
 * Exercises:
 *   1. Deterministic composer extension to Appendix sections (3.2.A.1/2/3) and
 *      Regional sections (3.2.R.1.US/EU/JP) — the sections most recently added
 *      to the Module 3 deterministic composer.
 *   2. AI-grounded refinement wrapper (refineSectionWithAI) — happy path,
 *      hallucination-guard fallback, and gateway-error fallback.
 *
 * Why these specific cases:
 *   - 3.2.A.2 must downshift to a "Not applicable" narrative for chemical
 *     (non-biological) drug substances. A composer that always rendered the
 *     biologic narrative would falsely imply viral-safety obligations on a
 *     small-molecule program.
 *   - 3.2.R.1.{US,EU,JP} must produce REGIONALLY DISTINCT pointer narratives
 *     (FDA citations, EMA citations, PMDA citations). A composer that
 *     emitted the same regional text under three different keys would be a
 *     silent regulatory bug.
 *   - refineSectionWithAI is the trust boundary into the LLM. Its
 *     hallucination guard (4+ digit numeric / identifier-shaped tokens
 *     absent from sources) must trip on fabricated specifics, and its
 *     gateway-error path must surface { fallback: true } rather than
 *     propagating the exception to the caller.
 *
 * The AI gateway is mocked via vi.mock of
 *   server/services/ai-gateway/gateway
 * which is the module the narrative builder imports `getGateway` from.
 *
 * @module tests/unit/module3-narrative-extension.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mock handles so the vi.mock factory below can close over them and
// each `it` block can re-stub gateway behavior without re-registering the mock.
const h = vi.hoisted(() => ({
  route: vi.fn(),
}));

vi.mock('../../server/services/ai-gateway/gateway', () => ({
  getGateway: () => ({ route: h.route }),
}));
// The narrative builder imports via the `.js` extension form; vitest resolves
// both, but registering the explicit `.js` specifier guarantees the mock is
// applied regardless of which resolver path wins.
vi.mock('../../server/services/ai-gateway/gateway.js', () => ({
  getGateway: () => ({ route: h.route }),
}));

import { type CanonicalSource } from '../../server/services/module3Composer';
import {
  composeAppendices,
  composeRegional,
} from '../../server/services/module3-extensions';
import { refineSectionWithAI } from '../../server/services/cmc/module3-narrative-builder';

// ─────────────────────────────────────────────────────────────────────────────
// Source-object fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenant tags applied to every source used with the AI wrapper. The wrapper
 * enforces (organizationId, projectId) parity as a tenant-isolation boundary
 * — fixtures must share these or the wrapper throws BEFORE any AI call.
 */
const ORG_ID = 42;
const PROJECT_ID = 7;
const USER_ID = 1001;

/** Build a fully-populated set of canonical sources for a SMALL-MOLECULE program. */
function smallMoleculeSources(): CanonicalSource[] {
  return [
    {
      id: 'ds-1',
      sourceType: 'drug_substance',
      sourcePayload: {
        name: 'Compound-X',
        manufacturer: 'Acme API Inc.',
        manufacturingRoute: 'Chemical synthesis (5-step)',
        processDescription: 'Stepwise condensation, crystallization, and purification.',
        modality: 'small_molecule',
      },
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
    },
    {
      id: 'dp-1',
      sourceType: 'drug_product',
      sourcePayload: {
        dosageFormDescription: 'Immediate-release tablet',
        strength: '50 mg',
        composition: 'API, microcrystalline cellulose, magnesium stearate',
        manufacturingSite: 'Acme Pharma, Site A',
        batchNumber: 'LOT-2024A',
        batchSize: '100,000 tablets',
      },
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
    },
    {
      id: 'mp-1',
      sourceType: 'manufacturing_process',
      sourcePayload: {
        manufacturingSite: 'Acme Pharma, Site A',
        manufacturingRoute: 'Direct compression',
        processDescription: 'Blending → compression → coating → packaging',
        processSteps: [
          { operation: 'Blending', equipment: 'V-Blender V-200', ipc: 'Blend uniformity' },
          { operation: 'Compression', equipment: 'Rotary press RP-12', ipc: 'Tablet weight ± 3%' },
        ],
      },
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
    },
    {
      id: 'cc-1',
      sourceType: 'container_closure',
      sourcePayload: {
        containerDescription: 'HDPE bottle, 100-count',
        closureDescription: 'Polypropylene child-resistant cap',
        suitabilityJustification: 'USP <671> compliant; stability data on file.',
      },
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
    },
    {
      id: 'fr-1',
      sourceType: 'formulation_record',
      sourcePayload: {
        formulationName: 'Formulation V3',
        version: '3.0',
        components: [
          { component: 'Compound-X', role: 'API', amount: '50 mg', origin: 'synthetic' },
          { component: 'Microcrystalline cellulose', role: 'Diluent', amount: '120 mg', origin: 'plant' },
          { component: 'Magnesium stearate', role: 'Lubricant', amount: '2 mg', origin: 'synthetic' },
        ],
      },
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Deterministic composer — Appendix (3.2.A.*) sections
// ─────────────────────────────────────────────────────────────────────────────

describe('composeAppendices — Appendix sections (3.2.A.*)', () => {
  it('produces non-empty output for 3.2.A.1, 3.2.A.2, and 3.2.A.3', () => {
    const sections = composeAppendices(smallMoleculeSources());

    for (const key of ['3.2.A.1', '3.2.A.2', '3.2.A.3']) {
      const sec = sections.find((s) => s.sectionKey === key);
      expect(sec, `section ${key} should be emitted`).toBeDefined();
      expect(sec!.narrativeDraft.length).toBeGreaterThan(0);
      expect(sec!.structuredPayload).toBeDefined();
      // Composer must surface section identity in its structured payload — this
      // is what downstream lineage/audit consumers index on.
      expect(sec!.structuredPayload.sectionKey).toBe(key);
    }
  });

  it('3.2.A.2 produces "not applicable" narrative when no biological drug substance is present', () => {
    const sections = composeAppendices(smallMoleculeSources());
    const a2 = sections.find((s) => s.sectionKey === '3.2.A.2');
    expect(a2).toBeDefined();
    // The chemical-modality path must render the NOT-APPLICABLE narrative —
    // never the biologic narrative — for a small-molecule program. Anchor
    // on the literal phrase the composer emits so the assertion guards the
    // user-visible regulatory statement.
    expect(a2!.narrativeDraft.toLowerCase()).toContain('not applicable');
    expect(a2!.narrativeDraft).toContain('chemical');
    // And it must NOT claim a viral safety evaluation was performed.
    expect(a2!.narrativeDraft).not.toMatch(/viral safety evaluation:/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deterministic composer — Regional (3.2.R.1.*) sections
// ─────────────────────────────────────────────────────────────────────────────

describe('composeRegional — Regional sections (3.2.R.1.*)', () => {
  /**
   * Regional dispatch is per-region: compose US/EU/JP independently and merge,
   * since a single submission targets one region but these tests assert the
   * full regional matrix is distinct.
   */
  function allRegions() {
    const src = smallMoleculeSources();
    return [
      ...composeRegional(src, 'US'),
      ...composeRegional(src, 'EU'),
      ...composeRegional(src, 'JP'),
    ];
  }

  it('produces non-empty output for 3.2.R.1.US, 3.2.R.1.EU, and 3.2.R.1.JP', () => {
    const sections = allRegions();

    for (const key of ['3.2.R.1.US', '3.2.R.1.EU', '3.2.R.1.JP']) {
      const sec = sections.find((s) => s.sectionKey === key);
      expect(sec, `section ${key} should be emitted`).toBeDefined();
      expect(sec!.narrativeDraft.length).toBeGreaterThan(0);
      expect(sec!.tables.length).toBeGreaterThan(0);
    }
  });

  it('regional narratives are distinct — each cites its own regulator and framework', () => {
    const sections = allRegions();
    const us = sections.find((s) => s.sectionKey === '3.2.R.1.US')!;
    const eu = sections.find((s) => s.sectionKey === '3.2.R.1.EU')!;
    const jp = sections.find((s) => s.sectionKey === '3.2.R.1.JP')!;

    // US — FDA-specific regulatory anchors
    expect(us.narrativeDraft).toMatch(/FDA/);
    expect(us.narrativeDraft).toMatch(/21 CFR/);
    // NDA / ANDA / BLA submission types are the FDA-specific vocabulary.
    expect(us.narrativeDraft).toMatch(/NDA|ANDA|BLA/);

    // EU — EMA-specific regulatory anchors
    expect(eu.narrativeDraft).toMatch(/EMA/);
    expect(eu.narrativeDraft).toMatch(/Marketing Authorisation Application|MAA/);
    expect(eu.narrativeDraft).toMatch(/Annex 16|Annex 15|CEP/);

    // JP — PMDA / MHLW-specific regulatory anchors
    expect(jp.narrativeDraft).toMatch(/PMDA|MHLW/);
    expect(jp.narrativeDraft).toMatch(/J-NDA|Shinyaku Shinsei|PMD Act/);
    expect(jp.narrativeDraft).toMatch(/Japanese Pharmacopoeia|JP 18th/);

    // Cross-region distinctness — no two regions share the same narrative body.
    expect(us.narrativeDraft).not.toEqual(eu.narrativeDraft);
    expect(us.narrativeDraft).not.toEqual(jp.narrativeDraft);
    expect(eu.narrativeDraft).not.toEqual(jp.narrativeDraft);

    // Negative cross-contamination assertions — a JP narrative that mentioned
    // FDA / 21 CFR, or a US narrative that mentioned PMDA, would silently
    // mislead reviewers. Lock those out.
    expect(eu.narrativeDraft).not.toMatch(/21 CFR/);
    expect(jp.narrativeDraft).not.toMatch(/21 CFR/);
    expect(us.narrativeDraft).not.toMatch(/PMDA|MHLW/);
    expect(us.narrativeDraft).not.toMatch(/\bEMA\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI refinement wrapper — refineSectionWithAI
// ─────────────────────────────────────────────────────────────────────────────

describe('refineSectionWithAI — gateway integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Build a minimal RefineSectionInput. The deterministic narrative carries
   * batch identifier "LOT-2024A" so callers can assert the grounding set picks
   * it up. Sources are tenant-tagged to (ORG_ID, PROJECT_ID) to satisfy the
   * boundary check that fires BEFORE the gateway is invoked.
   */
  function buildInput(overrides: Partial<{ deterministicNarrative: string }> = {}) {
    return {
      sectionKey: '3.2.P.3',
      deterministicNarrative:
        overrides.deterministicNarrative ??
        'The drug product is manufactured according to batch formula LOT-2024A at Site A.',
      sourceObjects: [
        {
          type: 'drug_product',
          payload: {
            dosageFormDescription: 'Immediate-release tablet',
            batchNumber: 'LOT-2024A',
            batchSize: '100000 tablets',
            manufacturingSite: 'Site A',
          },
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
        },
      ],
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
    };
  }

  it('returns refinedNarrative and grounding on a clean gateway response', async () => {
    // Mocked refinement preserves the deterministic identifier (LOT-2024A,
    // 100000) so the hallucination guard does not trip.
    h.route.mockResolvedValueOnce({
      content:
        'The drug product is manufactured per batch formula LOT-2024A (batch size 100000 tablets) at Site A.',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, estimatedCostUsd: 0.0021 },
      latencyMs: 250,
      requestId: 'req-1',
      cached: false,
      deterministic: false,
    });

    const result = await refineSectionWithAI(buildInput());

    expect(h.route).toHaveBeenCalledTimes(1);
    expect(result.fallback).toBe(false);
    expect(result.refinedNarrative).toContain('LOT-2024A');
    // Grounding set must surface tokens from BOTH the sources (batchNumber,
    // batchSize) and the deterministic narrative (which is by construction
    // source-grounded). At minimum LOT-2024A and 100000 should appear.
    expect(result.grounding).toEqual(expect.arrayContaining(['LOT-2024A']));
    expect(result.grounding).toEqual(expect.arrayContaining(['100000']));
    expect(result.model).toBe('claude-opus-4-7');
    expect(result.tokenCost).toBeGreaterThan(0);
  });

  it('hallucination guard triggers fallback when AI output contains a 4+ digit number absent from sources', async () => {
    // The number 99999 appears nowhere in the source payloads or deterministic
    // draft — the guard must flag it and force the deterministic narrative.
    h.route.mockResolvedValueOnce({
      content:
        'The drug product is manufactured per batch formula LOT-2024A at Site A with a batch size of 99999 tablets.',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, estimatedCostUsd: 0.0021 },
      latencyMs: 250,
      requestId: 'req-2',
      cached: false,
      deterministic: false,
    });

    const input = buildInput();
    const result = await refineSectionWithAI(input);

    expect(h.route).toHaveBeenCalledTimes(1);
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe('hallucination_guard');
    // Fallback must restore the DETERMINISTIC narrative verbatim — never the
    // hallucinated refinement that tripped the guard.
    expect(result.refinedNarrative).toBe(input.deterministicNarrative);
    expect(result.refinedNarrative).not.toContain('99999');
    // Model/cost are still reported (the call happened) so audit accounting
    // is intact even on guard-trip.
    expect(result.model).toBe('claude-opus-4-7');
  });

  it('returns { fallback: true, fallbackReason: "gateway_error" } when the gateway throws', async () => {
    h.route.mockRejectedValueOnce(new Error('gateway: upstream provider unavailable'));

    const input = buildInput();
    const result = await refineSectionWithAI(input);

    expect(h.route).toHaveBeenCalledTimes(1);
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe('gateway_error');
    // On gateway error the wrapper preserves the deterministic narrative
    // verbatim — the caller should never see the exception bubble up.
    expect(result.refinedNarrative).toBe(input.deterministicNarrative);
    // Cost and model are zeroed because no usable response was received.
    expect(result.model).toBe('');
    expect(result.tokenCost).toBe(0);
    // Grounding is intentionally empty on gateway error (the wrapper short-
    // circuits before assembling it for return).
    expect(result.grounding).toEqual([]);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * §3.2.A.3 — what the excipient-origin section is allowed to CLAIM
 *
 * This is the CTD section that declares whether any excipient is of human or
 * animal origin, and it draws a TSE/BSE safety conclusion from that. Two
 * defects made it draw one it had not earned.
 * ────────────────────────────────────────────────────────────────────────── */
describe('composeAppendices — 3.2.A.3 claims only what the register records', () => {
  const source = (sourceType: string, sourcePayload: Record<string, unknown>) =>
    ({ id: 's-' + sourceType, sourceType, sourcePayload, sourceHash: 'h' }) as never;
  const formulation = (components: Array<Record<string, unknown>>) =>
    source('formulation_record', { formulationName: 'F3', status: 'current', components });
  const a3Of = (sources: never[]) =>
    composeAppendices(sources).find((s) => s.sectionKey === '3.2.A.3')!;
  const rowValue = (sec: { tables: Array<{ rows: string[][] }> }, label: string) =>
    sec.tables.flatMap((t) => t.rows).find((r) => r[0] === label)?.[1];

  it('counts each formulation component once', () => {
    /* The rewritten collector spread every formulation record's components and
       THEN appended a first-match `valArr(m, 'components')` over the same
       matched sources — and formulation_record is one of this section's source
       types, so its rows were added twice. Every excipient count the section
       printed, in the CTD section whose purpose is enumerating excipients for
       TSE/BSE assessment, was doubled. */
    const sec = a3Of([
      formulation([
        { component: 'A', origin: 'plant' },
        { component: 'B', origin: 'synthetic' },
        { component: 'C', origin: 'mineral' },
      ]),
      source('drug_product', { dosageFormDescription: 'Tablet' }),
    ] as never[]);
    expect(rowValue(sec, 'Excipients Recorded')).toBe('3');
    expect(rowValue(sec, 'Origin Recorded For')).toBe('3 of 3');
    expect(sec.narrativeDraft).toContain('All 3 recorded excipients');
  });

  it('draws the TSE/BSE conclusion only where every origin was recorded', () => {
    const sec = a3Of([
      formulation([
        { component: 'A', origin: 'plant' },
        { component: 'B', origin: 'synthetic' },
      ]),
      source('drug_product', { dosageFormDescription: 'Tablet' }),
    ] as never[]);
    expect(sec.narrativeDraft).toContain('no additional TSE/BSE or viral safety documentation is required');
  });

  it('refuses the TSE/BSE conclusion when any origin is unrecorded', () => {
    /* The closing sentence sat OUTSIDE the conditional, so the section stated
       that no TSE/BSE documentation was required in the same paragraph as it
       stated that the origin of some excipients was NOT established — a
       positive safety claim drawn from the absence of a signal in data that was
       never scanned. A gelatin capsule shell recorded without its origin field
       produced a written all-clear. */
    const sec = a3Of([
      formulation([
        { component: 'A', origin: 'synthetic' },
        { component: 'B' },
        { component: 'C' },
      ]),
      source('drug_product', { dosageFormDescription: 'Tablet' }),
    ] as never[]);
    expect(sec.narrativeDraft).not.toContain('no additional TSE/BSE or viral safety documentation is required');
    expect(sec.narrativeDraft).toContain('NOT established');
    expect(sec.narrativeDraft).toContain('Record the origin of each');
    expect(rowValue(sec, 'Origin Recorded For')).toBe('1 of 3');
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * The appendix generators, after the adversarial review.
 *
 * Six confirmed findings, every one of them the same shape: a positive safety
 * claim made from the ABSENCE of a signal in data nobody recorded. These are
 * the CTD sections that declare adventitious-agent and TSE/BSE risk, so a
 * fabricated all-clear here is the worst kind this product can produce.
 * ────────────────────────────────────────────────────────────────────────── */
describe('composeAppendices — claims only what the registers hold', () => {
  const source = (sourceType: string, sourcePayload: Record<string, unknown>) =>
    ({ id: 's-' + sourceType + '-' + String(sourcePayload.k ?? ''), sourceType, sourcePayload, sourceHash: 'h' }) as never;
  const a3Of = (sources: never[]) => composeAppendices(sources).find((s) => s.sectionKey === '3.2.A.3')!;
  const a2Of = (sources: never[]) => composeAppendices(sources).find((s) => s.sectionKey === '3.2.A.2')!;
  const cell = (sec: { tables: Array<{ rows: string[][] }> }, label: string) =>
    sec.tables.flatMap((t) => t.rows).find((r) => r[0] === label)?.[1];

  it('does not state a TSE/BSE certificate for an excipient that has none recorded', () => {
    /* The register emits '' for a blank certificate, and the column fell back
       to the literal "Certificate on file (CEP/TSE-compliant)" — so a gelatin
       capsule shell whose CEP has not been obtained was declared certified. */
    const sec = a3Of([
      source('excipient', { materialName: 'Gelatin capsule shell', functionInFormulation: 'Capsule shell', origin: 'animal', tseCertificate: '' }),
    ] as never[]);
    const printed = JSON.stringify(sec);
    expect(printed).not.toContain('Certificate on file');
    expect(printed).toContain('NOT RECORDED');
    expect(sec.narrativeDraft).toMatch(/NO TSE\/BSE certificate is recorded/i);
  });

  it('reports the recorded certificate when there is one, and does not claim the rest', () => {
    const sec = a3Of([
      source('excipient', { materialName: 'Gelatin', origin: 'animal', tseCertificate: 'R1-CEP 2019-123' }),
    ] as never[]);
    expect(JSON.stringify(sec)).toContain('R1-CEP 2019-123');
    /* The country-of-origin statement and the viral safety evaluation are not
       fields this register holds, and the section used to assert both. */
    expect(sec.narrativeDraft).toMatch(/not held by this register|NOT established/i);
  });

  it('does not issue an animal-free all-clear when the only records name no components', () => {
    /* A retired excipient, or a formulation version saved with an empty
       components array: source count above zero, nothing to scan, and the
       narrative's `originRecorded === components.length` was 0 === 0. */
    const sec = a3Of([
      source('excipient', { materialName: 'Gelatin', origin: 'animal', status: 'retired' }),
      source('formulation_record', { formulationName: 'F1', status: 'current', components: [] }),
    ] as never[]);
    expect(sec.narrativeDraft).toContain('NOT ESTABLISHED');
    expect(sec.narrativeDraft).not.toContain('No excipients of human or animal origin are used');
    expect(sec.narrativeDraft).not.toContain('no additional TSE/BSE or viral safety documentation is required');
  });

  it('treats a fermentation origin as a question, not an exclusion', () => {
    /* The material register offers `fermentation`, and the classifier read it
       as neither animal nor unrecorded — so the section stated every origin was
       plant, mineral or synthetic, a category the register never recorded. */
    const sec = a3Of([
      source('formulation_record', {
        formulationName: 'F2', status: 'current',
        components: [{ component: 'Xanthan gum', origin: 'fermentation' }, { component: 'MCC', origin: 'plant' }],
      }),
    ] as never[]);
    expect(sec.narrativeDraft).toMatch(/fermentation or cell-culture origin/i);
    expect(sec.narrativeDraft).toContain('NOT ESTABLISHED');
    expect(sec.narrativeDraft).not.toContain('no additional TSE/BSE or viral safety documentation is required');
    expect(cell(sec, 'Applicability')).toMatch(/Review required/i);
  });

  it('a retired source feeds no appendix at all', () => {
    const sec = a3Of([
      source('excipient', { materialName: 'Gelatin', origin: 'animal', status: 'retired' }),
    ] as never[]);
    expect(sec.lineage).toHaveLength(0);
    expect(JSON.stringify(sec)).not.toContain('Gelatin');
  });

  it('3.2.A.2 does not clear a drug substance that records nothing', () => {
    /* isBiologic is false whenever every field it consults is absent, so a row
       carrying only a name produced a full adventitious-agents all-clear. */
    const sec = a2Of([source('drug_substance', { name: 'BX-204' })] as never[]);
    expect(sec.narrativeDraft).toContain('NOT ESTABLISHED');
    expect(sec.narrativeDraft).not.toContain('no animal- or human-derived raw materials');
    expect(cell(sec, 'Applicability')).toMatch(/Not established/i);
  });

  it('3.2.A.2 still reports non-applicability when a chemical route IS recorded', () => {
    const sec = a2Of([
      source('drug_substance', { name: 'BX-204', manufacturingRoute: 'Four-step convergent chemical synthesis' }),
    ] as never[]);
    expect(cell(sec, 'Applicability')).toMatch(/Not applicable/i);
  });

  it('a section whose own narrative says NOT ESTABLISHED is not scored complete', () => {
    /* completeness was `matched.length > 0 ? 100 : ...` — one row of the right
       type scored the section finished regardless of what it could say, and
       that number was persisted into cmc_module3_sections. */
    const sec = a2Of([source('drug_substance', { name: 'BX-204' })] as never[]);
    expect(sec.narrativeDraft).toContain('NOT ESTABLISHED');
    expect(sec.completeness).toBe(0);
    expect(sec.missingInputs.length).toBeGreaterThan(0);
  });
});
