/**
 * The order AnA is told to build a dossier in is the order the documents are
 * written from each other.
 *
 * The submission workflows (ana-ri/workflow-orchestration.ts) are rendered
 * into AnA's prompt every turn a submission type is known
 * (context-enrichment.ts → buildWorkflowContext), and getWorkflowStatus names
 * the "next step" as the first unfinished step in phase order. Until
 * 2026-10-04 (D2, docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/):
 *   - the clinical summary (2.7) depended on the clinical overview (2.5), and
 *     the nonclinical written summaries (2.6) on the nonclinical overview
 *     (2.4). ICH M4: an overview interprets its summaries, so the edge runs
 *     the other way;
 *   - in the NDA and BLA workflows the Module 2 summaries came before the
 *     Module 5 reports and Module 3 sections they summarise, so for a project
 *     with nothing done the next step AnA named was a summary of reports that
 *     did not exist;
 *   - the US NDA task blueprint called the pre-NDA meeting a Type A meeting.
 *     FDA's formal-meetings guidance: Type A is for an otherwise stalled
 *     program or an important safety issue; pre-NDA / pre-BLA are Type B;
 *   - the medical-writing base told AnA to "follow ICH E3 numbering exactly".
 *     ICH E3 Q&A (R1): E3 is a guideline, not a set of rigid requirements or a
 *     template, and flexibility is inherent in its use.
 */
import { describe, it, expect } from 'vitest';
import {
  getWorkflow,
  getWorkflowStatus,
  type SubmissionWorkflow,
  type WorkflowStep,
} from '../../server/services/ana-ri/workflow-orchestration';
import { taskBlueprint as usNdaTasks } from '../../server/services/regulatory/registry/blueprints/usNdaBlueprint';
import { taskBlueprint as usBlaTasks } from '../../server/services/regulatory/registry/blueprints/usBlaBlueprint';
import { composeMedicalWritingGuidance } from '../../server/services/ana/medical-writing';

const steps = (wf: SubmissionWorkflow): WorkflowStep[] => wf.phases.flatMap((p) => p.steps);
const order = (wf: SubmissionWorkflow): string[] => steps(wf).map((s) => s.id);
const withCode = (wf: SubmissionWorkflow, test: (code: string) => boolean): WorkflowStep[] =>
  steps(wf).filter((s) => s.ctdSection && test(s.ctdSection));

/** True when `from` depends on `to`, directly or through other steps. */
function dependsOn(wf: SubmissionWorkflow, from: string, to: string): boolean {
  const byId = new Map(steps(wf).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const stack = [...(byId.get(from)?.depends ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.depends ?? []));
  }
  return false;
}

const FDA_DRUG_WORKFLOWS = ['ind', 'nda', 'bla'] as const;

describe('the workflows AnA is guided by put each document after what it is written from', () => {
  it.each(FDA_DRUG_WORKFLOWS)('%s: an overview depends on its written summary, never the reverse', (type) => {
    const wf = getWorkflow(type)!;
    for (const [overview, summary] of [['2.4', '2.6'], ['2.5', '2.7']] as const) {
      const o = withCode(wf, (c) => c === overview)[0];
      const s = withCode(wf, (c) => c === summary)[0];
      if (!o || !s) continue;
      expect(dependsOn(wf, o.id, s.id), `${type}: ${overview} should depend on ${summary}`).toBe(true);
      expect(dependsOn(wf, s.id, o.id), `${type}: ${summary} must not depend on ${overview}`).toBe(false);
    }
  });

  it.each(['nda', 'bla'] as const)('%s: the clinical summary depends on every study report and integrated analysis', (type) => {
    const wf = getWorkflow(type)!;
    const summary = withCode(wf, (c) => c === '2.7')[0];
    const reports = withCode(wf, (c) => c.startsWith('5.3.5'));
    expect(summary, `${type} has a 2.7 step`).toBeTruthy();
    expect(reports.length, `${type} has Module 5 report steps`).toBeGreaterThan(0);
    for (const r of reports) {
      expect(dependsOn(wf, summary.id, r.id), `${type}: 2.7 should depend on ${r.title}`).toBe(true);
    }
  });

  it.each(FDA_DRUG_WORKFLOWS)('%s: the quality overall summary depends on the Module 3 it summarises', (type) => {
    const wf = getWorkflow(type)!;
    const qos = withCode(wf, (c) => c === '2.3')[0];
    for (const m3 of withCode(wf, (c) => c.startsWith('3.2.'))) {
      expect(dependsOn(wf, qos.id, m3.id), `${type}: 2.3 should depend on ${m3.title}`).toBe(true);
    }
  });

  it.each(FDA_DRUG_WORKFLOWS)('%s: phase order is a valid order of its own dependencies', (type) => {
    const wf = getWorkflow(type)!;
    const ids = order(wf);
    for (const s of steps(wf)) {
      for (const d of s.depends ?? []) {
        expect(ids.indexOf(d), `${type}: ${s.id} depends on ${d}, which must exist and come first`).toBeGreaterThanOrEqual(0);
        expect(ids.indexOf(d) < ids.indexOf(s.id), `${type}: ${d} must precede ${s.id}`).toBe(true);
      }
    }
  });

  it.each(['nda', 'bla'] as const)('%s: once planning is done, the first document AnA names is not a Module 2 summary', async (type) => {
    // getWorkflowStatus names the first unfinished step in phase order. With
    // no organization it reads no progress (it fails closed), so every step is
    // unfinished; the planning steps carry no CTD section, and the first step
    // that does is the first document AnA would send the writer to.
    const status = await getWorkflowStatus('project-without-progress', type);
    const firstDocument = status!.phases.flatMap((p) => p.steps)
      .map((s) => steps(getWorkflow(type)!).find((x) => x.id === s.id)!)
      .find((s) => s.ctdSection);
    expect(firstDocument?.ctdSection ?? '', `${type}: first document "${firstDocument?.title}"`).not.toMatch(/^2\.\d/);
  });
});

describe('the US NDA and BLA task blueprints name the pre-submission meeting as FDA classifies it', () => {
  it.each([
    ['pre-NDA', usNdaTasks],
    ['pre-BLA', usBlaTasks],
  ] as const)('%s is a Type B meeting', (label, blueprint) => {
    const task = blueprint.milestones.flatMap((m) => m.tasks).find((t) => new RegExp(label, 'i').test(t.title));
    expect(task, `${label} task`).toBeTruthy();
    const text = `${task!.title} ${task!.description}`;
    expect(text).toContain('Type B');
    expect(text).not.toMatch(/Type A meeting|\(Type A\)/);
  });
});

describe('the medical-writing base agrees with ICH E3 Q&A (R1)', () => {
  const brief = composeMedicalWritingGuidance({ documentType: 'csr' }).brief;

  it('does not require ICH E3 numbering exactly', () => {
    expect(brief).not.toMatch(/numbering exactly/i);
  });

  it('says E3 is a guideline, not a template, and cites the Q&A', () => {
    expect(brief).toMatch(/not a template/i);
    expect(brief).toContain('E3 Q&A (R1)');
  });
});
