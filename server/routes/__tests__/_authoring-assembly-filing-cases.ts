/** Additional scope and producer-to-consumer cases share the existing HTTP fixture. */
import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import type { AssemblyPlan } from '../../../shared/authoring/assembly';
import type { AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';
import { AUTHOR, ORG, PROGRAM, PROGRAM_B } from './_authoring-canvas-fixture';
import { getIndAuthoringTemplates } from '../../services/authoring/ind-authoring-templates';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../services/authoring/builtin-authoring-templates';
import { critiqueSavedDocument } from '../../services/ana/saved-document-critique';

interface AssemblyFixture {
  query: JourneyDb['pool']['query'];
  documentId(): string;
  clearStatements(): void;
  getStatements(): readonly string[];
  preview(extra?: Record<string, unknown>): PromiseLike<Response>;
  commit(plan: Pick<AssemblyPlan, 'fingerprint'>, extra?: Record<string, unknown>): PromiseLike<Response>;
  plan(extra?: Record<string, unknown>): Promise<AssemblyPlan>;
  stored(): Promise<Array<Record<string, unknown> & { id: string }>>;
  evidenceCounts(): Promise<unknown>;
  captured(): Promise<AssemblySourceSelector>;
}

export function registerAssemblyFilingCases(fixture: AssemblyFixture): void {
  registerBoundCases(fixture);
  registerSharedPlanningCases(fixture);
  registerReviewCase(fixture);
}

function registerSharedPlanningCases(fixture: AssemblyFixture): void {
  const { query, documentId, clearStatements, getStatements, preview, commit, plan, stored, evidenceCounts, captured } = fixture;
  describe('shared planning sources use the existing assembly without acquiring filing authority', () => {
    it.each(['RI_STRATEGY', 'RI_GAP_ANALYSIS', 'RI_COMPETITIVE', 'RI_HA_MEETING'])('assembles %s with retained source intent and parent identity', async registryId => {
      await query('UPDATE authoring_documents SET module=NULL WHERE id=$1', [documentId()]);
      const original = await stored();
      const parent = (await query('SELECT template_id,provenance FROM authoring_documents WHERE id=$1', [documentId()])).rows[0];
      const sources = [await captured()];
      const templateId = builtinAuthoringTemplateId(`registry:${registryId}`);
      const planned = await plan({ templateId, sources });
      expect(planned.draftRegion).toBeNull();
      expect(planned.rows).toHaveLength(5);
      expect(planned.rows.every(row => row.disposition === 'append' && row.content === '' && !row.aiDraftable)).toBe(true);
      expect(planned.sources?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      const built = await commit(planned, { templateId, sources });
      expect(built.status, JSON.stringify(built.body)).toBe(200);
      const saved = await stored();
      expect(saved).toHaveLength(6);
      expect(saved).toContainEqual(original[0]);
      expect((await query('SELECT template_id,provenance FROM authoring_documents WHERE id=$1', [documentId()])).rows[0]).toEqual(parent);
      const receipts = (await query("SELECT metadata->'assembly'->'sources' AS sources FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='ASSEMBLY_SOURCES'", [documentId()])).rows;
      expect(receipts).toEqual([{ sources: planned.sources }]);
    });

    it.each([['ind', 'fda'], ['mdl', 'hc']])('refuses an internal outline on a bound %s/%s filing before sources or writes', async (docType, agency) => {
      const filing = 'planning_scope_' + randomUUID();
      await query('INSERT INTO c2c_documents(id,org_id,project_id,doc_type,agency) VALUES($1,$2,$3,$4,$5)', [filing, ORG, PROGRAM, docType, agency]);
      await query('UPDATE authoring_documents SET module=NULL,c2c_document_id=$1 WHERE id=$2', [filing, documentId()]);
      const sources = [await captured()];
      const before = await stored(); const evidence = await evidenceCounts();
      const args = { templateId: builtinAuthoringTemplateId('registry:RI_STRATEGY'), sources };
      clearStatements();
      expect((await preview(args)).body.error).toBe('ASSEMBLY_FILING_SCOPE_MISMATCH');
      expect((await commit({ fingerprint: 'a'.repeat(64) }, args)).body.error).toBe('ASSEMBLY_FILING_SCOPE_MISMATCH');
      expect(getStatements().some(sql => /FROM cre_evidence_sources\b|^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
      expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(evidence);
    });
  });
}

function registerBoundCases(fixture: AssemblyFixture): void {
  const { query, documentId, clearStatements, getStatements, preview, commit, plan, stored, evidenceCounts, captured } = fixture;
  describe('regional bound filing applicability before any selected source is read', () => {
    async function bind(docType: string, agency: string, org: number = ORG, program: string = PROGRAM): Promise<void> {
      const id = 'scope_' + randomUUID();
      await query('INSERT INTO c2c_documents(id,org_id,project_id,doc_type,agency) VALUES($1,$2,$3,$4,$5)',
        [id, org, program, docType, agency]);
      await query('UPDATE authoring_documents SET module=NULL,c2c_document_id=$1 WHERE id=$2', [id, documentId()]);
      clearStatements();
    }

    it('refuses both preview and direct commit for a Japanese template on the Canadian home filing without writes or source reads', async () => {
      await bind('mdl', 'hc');
      const sources = [await captured()];
      const before = await stored(); const evidence = await evidenceCounts();
      const args = { templateId: builtinAuthoringTemplateId('registry:JP_SHONIN'), sources };
      clearStatements();
      const response = await preview(args);
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toBe('ASSEMBLY_FILING_SCOPE_MISMATCH');
      expect(getStatements().some(sql => /FROM cre_evidence_sources\b/.test(sql))).toBe(false);
      const attempted = await commit({ fingerprint: 'a'.repeat(64) }, args);
      expect(attempted.status, JSON.stringify(attempted.body)).toBe(409);
      expect(attempted.body.error).toBe('ASSEMBLY_FILING_SCOPE_MISMATCH');
      expect(getStatements().some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
      expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(evidence);
    });

    it.each([['mdl', 'hc', 'CA_MDL'], ['ninsho', 'jp_rcb', 'JP_NINTEI']])('builds the exact %s / %s preparation outline manually', async (docType, agency, registry) => {
      await bind(docType, agency);
      const templateId = builtinAuthoringTemplateId('registry:' + registry);
      const planned = await plan({ templateId });
      expect(planned.rows.every(row => !row.aiDraftable)).toBe(true);
      const response = await commit(planned, { templateId });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.plan.templateId).toBe(templateId);
      expect(await stored()).toHaveLength(planned.rows.length + 1);
    });

    it.each([['tenant', 2, PROGRAM], ['project', ORG, PROGRAM_B]] as const)('refuses a recorded binding in another %s', async (_scope, org, program) => {
      await bind('mdl', 'hc', org, program);
      const before = await stored(); const evidence = await evidenceCounts();
      const response = await preview({ templateId: builtinAuthoringTemplateId('registry:CA_MDL') });
      expect(response.status, JSON.stringify(response.body)).toBe(404);
      expect(response.body.error).toBe('ASSEMBLY_FILING_NOT_FOUND');
      expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(evidence);
    });

    it('refuses a stale plan when the binding class changes even though the common template remains applicable', async () => {
      await bind('nda', 'fda');
      await query("UPDATE authoring_documents SET module='M2' WHERE id=$1", [documentId()]);
      const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
      const planned = await plan({ templateId: template.id });
      const before = await stored(); const evidence = await evidenceCounts();
      await query("UPDATE c2c_documents SET doc_type='ind' WHERE id=(SELECT c2c_document_id FROM authoring_documents WHERE id=$1)", [documentId()]);
      const response = await commit(planned, { templateId: template.id });
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toBe('ASSEMBLY_CHANGED');
      expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(evidence);
    });
  });
}

function registerReviewCase(fixture: AssemblyFixture): void {
  const { query, documentId, commit, plan, stored, evidenceCounts } = fixture;
  describe('actual regional assembly receipts consumed by whole-document oversight', () => {
    it.each(['CA_MDL', 'RI_STRATEGY', 'RI_GAP_ANALYSIS', 'RI_COMPETITIVE', 'RI_HA_MEETING'])('reviews every exact %s section source and limit after HTTP assembly into a blank no-parent document', async registryId => {
      await query('DELETE FROM authoring_sections WHERE doc_id=$1', [documentId()]);
      await query('UPDATE authoring_documents SET module=NULL WHERE id=$1', [documentId()]);
      const templateId = builtinAuthoringTemplateId(`registry:${registryId}`);
      const template = (await getBuiltinAuthoringTemplate(templateId))!;
      const planned = await plan({ templateId });
      const built = await commit(planned, { templateId });
      expect(built.status, JSON.stringify(built.body)).toBe(200);
      const before = await stored(); const evidence = await evidenceCounts();
      const statements: string[] = [];
      const read = async (input: Record<string, unknown> = {}) => {
        const raw = await critiqueSavedDocument({ document_id: documentId(), ...input },
          { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM }, async (_opts, fn) => fn({
            query: async (sql, args) => {
              statements.push(sql);
              return { rows: (await query(sql, args)).rows as Array<Record<string, unknown>> };
            },
          }));
        expect(raw.length).toBeLessThanOrEqual(5000);
        return JSON.parse(raw) as { error?: string; complete: boolean; snapshotSha256: string; precisionVerdict: string;
          verdict: string; instruction: string; template: { id: string | null; sourceState: string };
          pagination: { nextOffset: number | null; total: number }; items: Array<Record<string, unknown>> };
      };
      const first = await read();
      expect(first.error).toBeUndefined();
      expect(first.complete).toBe(true);
      expect(first.template).toEqual({ id: null, sourceState: 'not-recorded' });
      expect(first.precisionVerdict).toBeTypeOf('string');
      expect(first.verdict).toBe('revise'); // Empty structure still needs authored text.
      expect(first.instruction).toContain('not approval or evidence verification');
      const items = [...first.items];
      let next = first.pagination.nextOffset;
      for (let page = 0; next !== null && page < 200; page++) {
        const result = await read({ offset: next, expected_snapshot: first.snapshotSha256 });
        expect(result.error).toBeUndefined();
        expect(result.snapshotSha256).toBe(first.snapshotSha256);
        expect(result.precisionVerdict).toBe(first.precisionVerdict);
        items.push(...result.items); next = result.pagination.nextOffset;
      }
      expect(next).toBeNull();
      expect(items).toHaveLength(first.pagination.total);
      for (const section of before) {
        expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', sectionId: section.id, templateId,
          source: expect.objectContaining({ id: templateId, entryId: `registry:${registryId}`, aiDraftable: false }),
          limitationCount: template.limitations.length }));
        for (const text of template.limitations) expect(items).toContainEqual(expect.objectContaining({
          kind: 'template-reference', sectionId: section.id, templateId, authority: 'recorded', field: 'limitations', text,
        }));
      }
      const parent = (await query('SELECT template_id FROM authoring_documents WHERE id=$1', [documentId()])).rows[0] as { template_id: string | null };
      expect(parent.template_id).toBeNull();
      expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
      expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(evidence);
    });
  });
}
