/** Section relevance cases reuse the sole authenticated assembly HTTP/SQL fixture. */
import { createHash } from 'node:crypto';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import type { AssemblyPlan } from '../../../shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';
import { ORG } from './_authoring-canvas-fixture';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../services/authoring/builtin-authoring-templates';

interface SectionSourceFixture {
  query: JourneyDb['pool']['query'];
  documentId(): string;
  templateId: string;
  clearStatements(): void;
  getStatements(): readonly string[];
  preview(extra?: Record<string, unknown>): PromiseLike<Response>;
  commit(plan: Pick<AssemblyPlan, 'fingerprint'>, extra?: Record<string, unknown>): PromiseLike<Response>;
  plan(extra?: Record<string, unknown>): Promise<AssemblyPlan>;
  stored(): Promise<Array<Record<string, unknown> & { id: string }>>;
  evidenceCounts(): Promise<unknown>;
  captured(text?: string): Promise<AssemblySourceSelector>;
  vaulted(text?: string): Promise<AssemblySourceSelector>;
  readSources(sources: AssemblySourceSelector[], expected?: AssemblySourceManifest): Promise<{
    manifest: AssemblySourceManifest; chunks: Array<{ content: string; title: string; sourceId: string | null }>;
  }>;
}
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const titleRow = (title = 'Analytical sensitivity') => ({ code: 'A.3', title, content: '', order_index: 0 });
const textFor = (marker: string) => 'Organization assembly template Performance Evaluation Report administrative cover. '.repeat(500)
  + '\n' + 'Unrelated archival notes. '.repeat(400) + `\n${marker}\n` + 'Neutral background material without scientific conclusions. '.repeat(300);

async function titleTemplate(f: SectionSourceFixture, title?: string) {
  await f.query('UPDATE authoring_templates SET template_content=$1::jsonb WHERE id=$2', [JSON.stringify({ sections: [titleRow(title)] }), f.templateId]);
  await f.query("UPDATE authoring_sections SET code=' A.3 ',title='Administratively renamed heading' WHERE doc_id=$1", [f.documentId()]);
  return { templateId: f.templateId, selection: { target: 'section', code: ' a.3 ' } };
}
async function guidanceTemplate(f: SectionSourceFixture) {
  const templateId = builtinAuthoringTemplateId('component:performance_evaluation_report');
  const template = await getBuiltinAuthoringTemplate(templateId);
  const section = template!.sections.find(row => row.code === '2')!;
  expect(section.title).toBe('Analytical Performance');
  expect(section.guidance.guidance_text).toContain('precision');
  await f.query('UPDATE authoring_documents SET module=$1 WHERE id=$2', [template!.module, f.documentId()]);
  return { templateId, selection: { target: 'section', code: '2' } };
}

export function registerAssemblySectionSourceCases(f: SectionSourceFixture): void {
  registerRelevantCases(f);
  registerOpeningCases(f);
  registerValidationCases(f);
}
function registerRelevantCases(f: SectionSourceFixture): void {
  describe('exact section source excerpts through existing assembly HTTP', () => {
    it.each([['data-room', 'title'], ['vault', 'title'], ['data-room', 'guidance'], ['vault', 'guidance']] as const)(
      'pins the later %s excerpt from canonical template %s through preview, commit and replay', async (kind, mode) => {
        const args = mode === 'title' ? await titleTemplate(f) : await guidanceTemplate(f);
        const marker = mode === 'title' ? 'Analytical sensitivity measured 3.75 assay units.' : 'Precision accuracy specificity measured 1.25 percent.';
        const text = textFor(marker);
        const source = kind === 'data-room' ? await f.captured(text) : await f.vaulted(text);
        const input = { ...args, sources: [source] };
        const before = await f.stored(); const counts = await f.evidenceCounts();
        f.clearStatements();
        const planned = await f.plan(input);
        expect(f.getStatements().some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
        expect(await f.stored()).toEqual(before); expect(await f.evidenceCounts()).toEqual(counts);
        expect(planned.rows).toHaveLength(1);
        if (mode === 'title') expect(planned.rows[0]).toMatchObject({ code: ' A.3 ', title: 'Administratively renamed heading', disposition: 'preserve' });
        else expect(planned.rows[0].draftingGuidance).toContain('precision');
        const entry = planned.sources!.entries[0]; const span = entry.span;
        expect(span.start).toBeGreaterThan(8000);
        expect(span.end - span.start).toBeLessThanOrEqual(8000);
        expect(span.totalChars).toBe(text.length);
        const excerpt = text.slice(span.start, span.end);
        expect(excerpt).toContain(marker);
        expect(excerpt).not.toContain('Organization assembly template');
        expect(entry.extractedTextSha256).toBe(sha(text)); expect(span.sha256).toBe(sha(excerpt));
        expect(JSON.stringify(planned)).not.toContain(marker);
        const replay = await f.readSources([source], planned.sources);
        expect(replay.manifest).toEqual(planned.sources); expect(replay.chunks[0].content).toBe(excerpt);
        const response = await f.commit(planned, input);
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        expect(response.body.data.plan.sources).toEqual(planned.sources);
        const receipts = (await f.query("SELECT metadata->'assembly'->'sources' AS sources FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='ASSEMBLY_SOURCES'", [f.documentId()])).rows;
        expect(receipts).toEqual([{ sources: planned.sources }]);
        expect(await f.stored()).toContainEqual(before[0]);
        expect(response.body.data.sections[0].content).toBe(mode === 'title' ? before[0].content : '');
      });
  });
}
function registerOpeningCases(f: SectionSourceFixture): void {
  describe('whole-document and unmatched section excerpts retain opening fallback', () => {
    it.each(['document', 'unmatched section'] as const)('keeps the opening for %s without copying source prose', async target => {
      const args = await titleTemplate(f, target === 'document' ? undefined : 'Unmatched pharmacokinetics');
      const text = textFor('Analytical sensitivity measured 3.75 assay units.');
      const source = target === 'document' ? await f.captured(text) : await f.vaulted(text);
      const selection = target === 'document' ? { target: 'document' } : args.selection;
      const planned = await f.plan({ ...args, selection, sources: [source] });
      const span = planned.sources!.entries[0].span;
      expect(span).toMatchObject({ start: 0, end: 8000, totalChars: text.length, sha256: sha(text.slice(0, 8000)) });
      const replay = await f.readSources([source], planned.sources);
      expect(replay.chunks[0].content).toBe(text.slice(0, 8000));
      expect(JSON.stringify(planned)).not.toContain('measured 3.75 assay units');
      expect(await f.evidenceCounts()).toMatchObject({ revisions: 0, audits: 0, lineage: 0 });
    });
  });
}
function registerValidationCases(f: SectionSourceFixture): void {
  describe('invalid assembly structure is refused before selected source bodies are read', () => {
    it.each(['missing section', 'duplicate template codes', 'ambiguous saved codes'] as const)('refuses %s before reading source content', async problem => {
      const args = await titleTemplate(f); const source = await f.captured(textFor('Analytical sensitivity observed.'));
      if (problem === 'missing section') args.selection.code = 'absent';
      if (problem === 'duplicate template codes') await f.query('UPDATE authoring_templates SET template_content=$1::jsonb WHERE id=$2',
        [JSON.stringify({ sections: [titleRow(), { ...titleRow(), code: ' a.3 ', order_index: 1 }] }), f.templateId]);
      if (problem === 'ambiguous saved codes') await f.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
        VALUES(gen_random_uuid(),$1,'a.3','Ambiguous additional heading','',901,$2)`, [f.documentId(), ORG]);
      const before = await f.stored(); const counts = await f.evidenceCounts();
      f.clearStatements();
      const response = await f.preview({ ...args, sources: [source] });
      expect(response.status, JSON.stringify(response.body)).toBe(problem === 'missing section' ? 404 : 409);
      expect(f.getStatements().some(sql => /\bFROM (?:public\.)?cre_evidence_sources\b/i.test(sql))).toBe(false);
      expect(f.getStatements().some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
      expect(await f.stored()).toEqual(before); expect(await f.evidenceCounts()).toEqual(counts);
    });
  });
}
