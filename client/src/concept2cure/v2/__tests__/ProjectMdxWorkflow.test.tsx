// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ProjectMdxWorkflow, mdxProjectPlan, type MdxWorkflowProject } from '../surfaces/ProjectMdxWorkflow';

const project: MdxWorkflowProject = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Client device',
  product_type: 'device', program_type: '510K', regulatory_path: '510k',
  primary_agency: 'FDA', device_flags: [],
};
const props = () => ({ project, otherFilings: [], marketsState: 'ready' as const,
  onNav: vi.fn(), onStage: vi.fn(), onAsk: vi.fn(), available: () => true });
afterEach(cleanup);

describe('project MDX workflow', () => {
  it('keeps a US diagnostic on its recorded 510(k) route and adds the assay bench', () => {
    const plan = mdxProjectPlan({ ...project, product_type: 'ivd' })!;
    /* Named as Plan names a US IND's list (slice A.1: it read "510(k) · Diagnostic project workflow"). */
    expect(plan.title).toBe('What this 510(k) needs');
    expect(plan.lead).toBe('Regulatory Affairs');
    expect(plan.packages.some(p => p.id === 'analytical-performance')).toBe(true);
    expect(plan.packages.some(p => p.id === 'performance-evaluation')).toBe(false);
    expect(plan.packages.some(p => p.id === 'sterilization-microbiology')).toBe(false);
    expect(plan.packages.some(p => p.id === 'software-cybersecurity')).toBe(false);
  });

  it('gives MDR clinical evaluation and IVDR performance evaluation different leads and deliverables', () => {
    const cer = mdxProjectPlan({ ...project, program_type: 'MDR', regulatory_path: null })!;
    expect(cer.lead).toBe('Clinical Affairs');
    expect(cer.summary).toContain('qualified evaluator');
    expect(cer.cadence).toContain('Living evaluation');
    expect(cer.packages.some(p => p.id === 'clinical-evidence')).toBe(true);
    const per = mdxProjectPlan({ ...project, product_type: 'cdx', program_type: 'IVDR', regulatory_path: null })!;
    expect(per.title).toBe('What this EU IVDR PER needs');
    expect(per.packages.some(p => p.id === 'performance-evaluation')).toBe(true);
    expect(per.packages.some(p => p.id === 'clinical-evidence')).toBe(false);
    expect(per.summary).toContain('PMPF');
  });

  it('shares evidence across recorded filings without converting a De Novo into a 510(k)', () => {
    const plan = mdxProjectPlan({ ...project, product_type: 'ivd', program_type: 'DE_NOVO', regulatory_path: 'de_novo' }, ['IVDR', 'IVDR'])!;
    expect(plan.title).toBe('What this De Novo needs');
    const analytical = plan.packages.filter(p => p.id === 'analytical-performance');
    expect(analytical).toHaveLength(1);
    expect(analytical[0].filingSectionsSupported.some(s => s.startsWith('de_novo:'))).toBe(true);
    expect(analytical[0].filingSectionsSupported.some(s => s.startsWith('ivdr:'))).toBe(true);
    expect(analytical[0].filingSectionsSupported.some(s => s.startsWith('510k:'))).toBe(false);
  });

  it('hands De Novo assembly to project authoring while preserving its filing identity', () => {
    const p = props();
    render(<ProjectMdxWorkflow {...p} project={{ ...project, program_type: 'DE_NOVO', regulatory_path: 'de_novo' }} />);
    const workflow = screen.getByTestId('pj-mdx-workflow');
    expect(workflow.querySelector('h2')?.textContent).toBe('What this De Novo needs');
    const assembly = workflow.querySelector('[data-work-package="submission-assembly"]')! as HTMLElement;
    fireEvent.click(within(assembly).getByRole('button', { name: 'Write this work’s documents on Author' }));
    expect(p.onStage).toHaveBeenCalledWith('author');
    expect(p.onNav).not.toHaveBeenCalled();
    expect(within(assembly).queryByRole('button', { name: 'Assemble the eSTAR' })).toBeNull();
  });

  it('does not fabricate a 510(k) for an unknown device route or an MDX workflow for a drug', () => {
    expect(mdxProjectPlan({ ...project, program_type: 'HDE', regulatory_path: 'hde' })!.primary).toBeNull();
    expect(mdxProjectPlan({ ...project, product_type: 'drug', program_type: 'IND', regulatory_path: null })).toBeNull();
  });

  it('opens an existing feature and uses project evidence for specialist laboratory reports', () => {
    const p = props();
    render(<ProjectMdxWorkflow {...p} />);
    const workflow = screen.getByTestId('pj-mdx-workflow');
    const design = workflow.querySelector('[data-work-package="design-controls"]')! as HTMLElement;
    fireEvent.click(within(design).getByRole('button', { name: 'Build the risk file and design-control trace' }));
    expect(p.onNav).toHaveBeenCalledWith('device-engineering');
    const bench = workflow.querySelector('[data-work-package="bench-performance-testing"]')! as HTMLElement;
    fireEvent.click(within(bench).getByRole('button', { name: 'Add this work’s sources on Evidence' }));
    expect(p.onStage).toHaveBeenCalledWith('evidence');
    expect(workflow.textContent).toContain('named assignments and approvals remain');
    expect(workflow.querySelector('[data-status="done"], [data-status="approved"], [role="progressbar"]')).toBeNull();
  });

  it('states an unreadable additional-filing list and never offers a locked feature', () => {
    const p = props();
    render(<ProjectMdxWorkflow {...p} marketsState="unavailable" available={() => false} />);
    expect(screen.getByRole('status').textContent).toContain('primary filing only');
    expect(screen.queryByRole('button', { name: 'Build the risk file and design-control trace' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add this work’s sources on Evidence' }).length).toBeGreaterThan(0);
  });

  it('opens a secondary MDR evaluation from its clinical evidence without changing the primary 510(k)', () => {
    const p = props();
    render(<ProjectMdxWorkflow {...p} otherFilings={['MDR']} />);
    const workflow = screen.getByTestId('pj-mdx-workflow');
    expect(workflow.querySelector('h2')?.textContent).toBe('What this 510(k) needs');
    const clinical = workflow.querySelector('[data-work-package="clinical-evidence"]')! as HTMLElement;
    fireEvent.click(within(clinical).getByRole('button', { name: 'Write the clinical evaluation (CER)' }));
    expect(p.onNav).toHaveBeenCalledWith('device-cer');
  });

  it('uses project evidence for US assay work and only opens IVDR evidence for a recorded IVDR filing', () => {
    const p = props();
    const diagnostic = { ...project, product_type: 'ivd' };
    const view = render(<ProjectMdxWorkflow {...p} project={diagnostic} />);
    expect(screen.queryByRole('button', { name: 'Record analytical and clinical performance (IVDR)' })).toBeNull();
    view.rerender(<ProjectMdxWorkflow {...p} project={diagnostic} otherFilings={['IVDR']} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Record analytical and clinical performance (IVDR)' })[0]);
    expect(p.onNav).toHaveBeenCalledWith('device-diagnostics');
    expect(screen.queryByRole('button', { name: 'Check IVDR completeness' })).toBeNull();
  });

  /* Slice A.1 (INFORMATION_ARCHITECTURE.md section 9, Door names): each door names its job, and a pathway's
     strategy and assembly doors are named by the pathway the project files. They read "Open pathway work",
     "Open eSTAR assembly" and "Open filing documents" for every pathway. */
  it.each([
    ['510(k)', { program_type: '510K', regulatory_path: '510k' }, 'device-510k', 'Choose predicates and build the SE comparison', 'Assemble the eSTAR'],
    ['PMA', { program_type: 'PMA', regulatory_path: 'pma' }, 'device-pma', 'See which PMA modules are written', 'Export the PMA package'],
    ['MDR', { program_type: 'MDR', regulatory_path: null }, 'device-cer', 'Gather literature and map the GSPRs', 'Export the CER'],
    ['IVDR', { product_type: 'cdx', program_type: 'IVDR', regulatory_path: null }, 'device-diagnostics', 'Record classification and performance evidence', 'Assemble the technical documentation'],
  ] as const)('a %s project names its strategy and assembly doors for the pathway, and opens its feature', (_label, filing, surface, strategy, assembly) => {
    const p = props();
    render(<ProjectMdxWorkflow {...p} project={{ ...project, ...filing }} />);
    const workflow = screen.getByTestId('pj-mdx-workflow');
    const pkg = (id: string) => workflow.querySelector(`[data-work-package="${id}"]`)! as HTMLElement;
    fireEvent.click(within(pkg('regulatory-strategy')).getByRole('button', { name: strategy }));
    expect(p.onNav).toHaveBeenLastCalledWith(surface);
    fireEvent.click(within(pkg('submission-assembly')).getByRole('button', { name: assembly }));
    expect(p.onNav).toHaveBeenLastCalledWith(surface);
  });

  it('names the software, agency, post-market and clinical-studies doors for their jobs', () => {
    const p = props();
    const view = render(<ProjectMdxWorkflow {...p} project={{ ...project, product_type: 'samd' }} />);
    const pkg = (id: string) => screen.getByTestId('pj-mdx-workflow').querySelector(`[data-work-package="${id}"]`)! as HTMLElement;
    fireEvent.click(within(pkg('software-cybersecurity')).getByRole('button', { name: 'Check the software and cybersecurity documentation' }));
    expect(p.onNav).toHaveBeenLastCalledWith('device-software');
    fireEvent.click(within(pkg('postmarket')).getByRole('button', { name: 'Run post-market surveillance and CAPA' }));
    expect(p.onNav).toHaveBeenLastCalledWith('device-postmarket');
    fireEvent.click(within(pkg('authority-review')).getByRole('button', { name: 'Answer the agency on Respond' }));
    expect(p.onStage).toHaveBeenLastCalledWith('respond');
    view.rerender(<ProjectMdxWorkflow {...p} project={{ ...project, program_type: 'PMA', regulatory_path: 'pma' }} />);
    fireEvent.click(within(pkg('clinical-evidence')).getByRole('button', { name: 'Record the clinical studies behind this filing' }));
    expect(p.onNav).toHaveBeenLastCalledWith('device-clinical-studies');
  });

  it('heads a filing with no recorded route by its kind, in words a client reads', () => {
    expect(mdxProjectPlan({ ...project, program_type: 'HDE', regulatory_path: 'hde' })!.title).toBe('What this device filing needs');
    expect(mdxProjectPlan({ ...project, product_type: 'ivd', program_type: 'HDE', regulatory_path: 'hde' })!.title).toBe('What this diagnostic filing needs');
  });
});
