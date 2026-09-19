/**
 * Labeling / prescribing-information — the org's USPI label worklist (GET + POST).
 *
 * GET /api/labeling-pi → the org's structured product-label sections (USPI / PLLR —
 * 21 CFR 201.57), held in the REAL, org-scoped store `labeling_pi_sections`
 * (labeling-pi-service.ts — a live write path, not the seed-only c2c_labeling_pi
 * blob), each shaped to exactly the keys the v2 LabelingPi surface renders
 * ({ n, label, st, flag, content, negotiation }), in USPI document order (HL, BW,
 * then numeric — derived from the section number, never stored). The rendered label
 * text (`content`) and the sponsor-vs-agency redline (`negotiation`) rehydrate from
 * JSONB.
 *
 *   GET  /api/labeling-pi → list (honest empty when the org has no label sections)
 *   POST /api/labeling-pi → record/author a section (upsert on org + section_no;
 *                           the real write path). Audited.
 *
 * Every POST here that writes a §11.10(e) audit row reports on its success
 * response whether that row reached a durable store, in `meta.auditTrail`
 * (WO-16C #133 — see the note above the `recordAuditRow` import).
 *
 * Org scoped; 403 without org context; GET fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import {
  upsertLabelingPiSection, listLabelingPiSections, acceptAgencyText,
  LabelingPiValidationError, LabelingPiConflictError,
  type LabelingPiSectionRow,
} from '../services/labeling/labeling-pi-service';
import {
  generateSplXml, validateSplStructure, type SplGenerationInput,
} from '../services/labeling/spl-generation-service';
/*
 * WO-16C #133. The three audit writes in this router were
 * `await auditService.logAction({…})` at statement position, which awaits the
 * call and then throws away the `AuditWriteResult` it resolves. `logAction`
 * never rejects when persistence fails — deliberately, an audit-trail outage
 * must not break the user action it records — so the discarded value was the
 * only place a lost §11.10(e) row was visible: the 201/200 envelope came back
 * byte-identical whether the record existed or not.
 *
 * They now go through the shared `recordAuditRow`, and each of the three
 * handlers that writes one (POST /, POST /:sectionNo/accept-agency-text,
 * POST /spl) carries its outcome out in that response's `meta.auditTrail`.
 * Each of those three writes exactly one audit row, so one unqualified
 * `auditTrail` key names it unambiguously in each envelope. The outcome is on
 * the success response only, and no error arm drops one: in each of the three
 * handlers the audit write is the last statement before the success response,
 * and every error arm — each pre-check return and each branch of the `catch` —
 * is entered from a step that runs before it, on a throw `recordAuditRow`
 * itself cannot raise (it never throws).
 *
 * None of the three reverts anything over a lost log row — see the note at each
 * call for what had already committed (or, for /spl, that nothing had).
 *
 * `recordAuditRow` never returns the store's own error text; that goes to its
 * own log line, keyed on the action and resource id. `auditService` is reached
 * through that module, so it is no longer imported here.
 */
import { recordAuditRow } from '../services/audit/audit-write-outcome';

/**
 * USPI section → SPL LOINC section, per 21 CFR 201.57's numbering and the NLM
 * SPL section codes the generator emits. Only the five sections the SPL
 * skeleton carries are mapped; the rest of the USPI has no slot in it and is
 * reported as such rather than silently dropped.
 */
const SPL_SOURCE_SECTIONS: ReadonlyArray<{ uspi: string; field: keyof Pick<SplGenerationInput, 'indications' | 'dosage' | 'contraindications' | 'warnings'>; title: string }> = [
  { uspi: '1', field: 'indications', title: 'Indications and usage' },
  { uspi: '2', field: 'dosage', title: 'Dosage and administration' },
  { uspi: '4', field: 'contraindications', title: 'Contraindications' },
  { uspi: '5', field: 'warnings', title: 'Warnings and precautions' },
];

/** The rendered prose of a section's content, or '' when it has none. */
function sectionText(row: LabelingPiSectionRow | undefined): string {
  const c = row?.content;
  if (!c || !Array.isArray(c.body)) return '';
  return c.body.join('\n\n').trim();
}

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const r = req as { userId?: unknown; user?: { id?: unknown } };
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Shape a stored row to the surface's render contract (section_no → n, status → st).
 *  `program` travels with the row because the surface heads the rendered label
 *  with the product it belongs to; it used to head every org's label with a
 *  hardcoded molecule name. Null when the org never recorded one — the surface
 *  says so rather than inventing one. */
function toView(r: LabelingPiSectionRow) {
  return {
    n: r.section_no,
    label: r.label,
    st: r.status,
    flag: r.flag ?? null,
    program: r.program ?? null,
    content: r.content ?? null,
    negotiation: r.negotiation ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const rows = await listLabelingPiSections(orgId);
    const data = rows.map(toView);
    return res.json({ data, meta: { count: data.length, source: 'labeling_pi_sections' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read labeling sections.' } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const row = await upsertLabelingPiSection(orgId, {
      sectionNo: String(b.sectionNo ?? b.n ?? ''),
      label: String(b.label ?? ''),
      status: b.status != null ? String(b.status) : b.st != null ? String(b.st) : null,
      flag: b.flag != null ? String(b.flag) : null,
      program: b.program != null ? String(b.program) : null,
      content: b.content,
      negotiation: b.negotiation,
      createdBy: userId,
    });
    /* WO-16C #133. A log BESIDE an already-committed write: the section row and
       its author lineage committed together inside `upsertLabelingPiSection`
       above, so a lost audit row is not a reason to undo them — the section
       stands and the caller is told instead, in `meta.auditTrail`. */
    const auditTrail = await recordAuditRow({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'LABELING_PI_SECTION_RECORDED',
      resourceType: 'labeling_pi_section',
      resourceId: row.id,
      details: { sectionNo: row.section_no, status: row.status, flag: row.flag },
    });
    return res.status(201).json({ data: toView(row), id: row.id, meta: { auditTrail } });
  } catch (err) {
    if (err instanceof LabelingPiValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record labeling section.' } });
  }
});

/**
 * POST /api/labeling-pi/:sectionNo/accept-agency-text
 *
 * Adopt the agency's proposed wording for one label section — the governed
 * action behind the negotiation panel's "Accept FDA text". A 21 CFR 11.10(e)
 * reason for change is REQUIRED: this replaces the sponsor's words in the
 * highest-stakes document of the review, and an audit trail that records the
 * change without recording why it was made is not an audit trail.
 *
 * 400 without a usable reason, 404/409 when the section has no agency text to
 * adopt (fails closed — never approves the sponsor's own draft as if the
 * agency had written it), 201-shaped 200 with the refreshed row on success.
 */
router.post('/:sectionNo/accept-agency-text', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = typeof b.reasonForChange === 'string' ? b.reasonForChange.trim() : '';
  if (reason.length < 8) {
    return res.status(400).json({
      error: {
        code: 'REASON_REQUIRED',
        message: 'A reason for change of at least 8 characters is required to accept agency-proposed label text.',
      },
    });
  }
  if (reason.length > 2000) {
    return res.status(400).json({ error: { code: 'REASON_TOO_LONG', message: 'The reason for change exceeds 2000 characters.' } });
  }

  try {
    const { row, previousContent } = await acceptAgencyText(orgId, String(req.params.sectionNo), { userId });
    /* WO-16C #133. A log BESIDE an already-committed write: `acceptAgencyText`
       above replaced the section's content, set it to 'approved' and
       re-attributed its lineage in one committed transaction, so a lost audit
       row is not a reason to undo the adoption — it stands and the caller is
       told, in `meta.auditTrail`.
       What a failed row does cost is specific and worth naming: the section row
       carries the adopted text but no `reason_for_change` column, so
       `reasonForChange` below is held in this audit entry and nowhere else in
       the schema. When `auditTrail.persisted` is false, the label change has
       happened with no recorded reason for it — the thing the docstring above
       calls "not an audit trail" — and the response now says so instead of
       reporting the accept as fully recorded. */
    const auditTrail = await recordAuditRow({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'LABELING_PI_AGENCY_TEXT_ACCEPTED',
      resourceType: 'labeling_pi_section',
      resourceId: row.id,
      details: {
        sectionNo: row.section_no,
        reasonForChange: reason,
        // Both sides of the change, so the entry answers "what did it say
        // before" without a second query against a row that has moved on.
        previousContent,
        acceptedText: row.negotiation?.agency ?? null,
        negotiationRound: row.negotiation?.round ?? null,
        negotiationCycle: row.negotiation?.cycle ?? null,
      },
    });
    return res.json({ data: toView(row), meta: { auditTrail } });
  } catch (err) {
    if (err instanceof LabelingPiValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    if (err instanceof LabelingPiConflictError) {
      const missing = /No label section/.test(err.message);
      return res.status(missing ? 404 : 409).json({
        error: { code: missing ? 'NOT_FOUND' : 'NOTHING_TO_ACCEPT', message: err.message },
      });
    }
    console.error(
      '[labeling-pi] accept agency text failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to accept the agency text.' } });
  }
});

/**
 * POST /api/labeling-pi/spl
 *
 * Build the FDA SPL (Structured Product Labeling) XML for this organization's
 * label — the submission format behind the surface's "SPL" tab.
 *
 * The label PROSE comes from the org's own stored USPI sections; it is never
 * re-authored or inferred here. Product identity (name, ingredients,
 * manufacturer, NDC) is not part of the label store, so it is supplied on the
 * request and validated: an SPL missing a product name or manufacturer is not
 * a submission, and generating one anyway would produce a file that looks
 * conformant and is not.
 *
 * 409 with the specific list of empty sections when the label itself has no
 * text to carry — an SPL whose Indications element is blank is worse than no
 * SPL at all.
 */
router.post('/spl', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const productName = typeof b.productName === 'string' ? b.productName.trim() : '';
  const manufacturer = typeof b.manufacturer === 'string' ? b.manufacturer.trim() : '';
  // The generator refuses an SPL with no active ingredient (a drug product
  // element with an empty ingredient list is not a submission), so that is
  // part of the identity contract here rather than a 500 from downstream.
  const activeIngredients: Array<{ name: string; strength?: string }> = [];
  if (Array.isArray(b.activeIngredients)) {
    for (const raw of b.activeIngredients as unknown[]) {
      const i = (raw ?? {}) as Record<string, unknown>;
      const name = typeof i.name === 'string' ? i.name.trim() : '';
      if (!name) continue;
      activeIngredients.push(
        typeof i.strength === 'string' && i.strength.trim() !== ''
          ? { name, strength: i.strength.trim() }
          : { name },
      );
    }
  }
  const missingIdentity: string[] = [];
  if (!productName) missingIdentity.push('productName');
  if (!manufacturer) missingIdentity.push('manufacturer');
  if (activeIngredients.length === 0) missingIdentity.push('activeIngredients');
  if (missingIdentity.length > 0) {
    return res.status(400).json({
      error: {
        code: 'PRODUCT_IDENTITY_REQUIRED',
        message: `SPL requires ${missingIdentity.join(', ')} — these are not carried in the label store and must be supplied.`,
        missing: missingIdentity,
      },
    });
  }

  try {
    const rows = await listLabelingPiSections(orgId);
    const byNo = new Map(rows.map((r) => [r.section_no, r]));
    const text: Record<string, string> = {};
    const emptySections: Array<{ uspi: string; title: string }> = [];
    for (const m of SPL_SOURCE_SECTIONS) {
      const t = sectionText(byNo.get(m.uspi));
      text[m.field] = t;
      if (!t) emptySections.push({ uspi: m.uspi, title: m.title });
    }
    if (emptySections.length > 0) {
      return res.status(409).json({
        error: {
          code: 'LABEL_SECTIONS_EMPTY',
          message: `The SPL cannot be built: ${emptySections.map((e) => `§${e.uspi} ${e.title}`).join(', ')} ${emptySections.length === 1 ? 'has' : 'have'} no authored text in this organization's label.`,
          emptySections,
        },
      });
    }

    /* No version is passed: `labeling_pi_sections` records no label version, so
       there is nothing here to advance one from. Every SPL this route builds is
       therefore version 1 of its setId. FDA expects the version to advance for
       each new version of the same labeling, so a resubmission after a label
       change needs a version the store does not yet hold. `SplGenerationInput`
       takes one the moment there is something to read. */
    const result = generateSplXml({
      productName,
      ndc: typeof b.ndc === 'string' && b.ndc.trim() !== '' ? b.ndc.trim() : undefined,
      activeIngredients,
      indications: text.indications,
      contraindications: text.contraindications,
      warnings: text.warnings,
      dosage: text.dosage,
      route: typeof b.route === 'string' && b.route.trim() !== '' ? b.route.trim() : undefined,
      manufacturer,
    });
    // Say honestly whether what we just produced passes the generator's own
    // structural check, rather than handing back XML labelled "generated".
    const validation = validateSplStructure(result.xml);

    /* WO-16C #133. Not a log beside a write — this handler persists nothing.
       `generateSplXml` and `validateSplStructure` are pure (no store is reached
       from either) and `listLabelingPiSections` above is a read, so there is no
       committed mutation here to revert or to keep: the audit row is the only
       record anywhere that this organization's label was rendered to SPL. The
       generated XML itself reaches the caller in this same response either way,
       so a lost row does not make the response untrue once the response says the
       row is missing — which `meta.auditTrail` now does. */
    const auditTrail = await recordAuditRow({
      organizationId: orgId,
      userId: getUserId(req) ?? undefined,
      action: 'LABELING_SPL_GENERATED',
      resourceType: 'labeling_pi_section',
      resourceId: String(orgId),
      details: {
        productName,
        sectionCount: result.sectionCount,
        sourceSections: SPL_SOURCE_SECTIONS.map((m) => m.uspi),
        valid: validation.valid,
      },
    });
    return res.json({
      data: { xml: result.xml, sectionCount: result.sectionCount, validation },
      meta: { auditTrail },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(409).json({
        error: { code: 'LABEL_SECTIONS_EMPTY', message: 'No label sections are recorded for this organization yet.' },
      });
    }
    console.error('[labeling-pi] SPL generation failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to build the SPL document.' } });
  }
});

export default router;
