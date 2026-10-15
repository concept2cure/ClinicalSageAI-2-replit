import { describe, expect, it } from 'vitest';
import { getAvailableFlows, getFlowDefinition, resolveFlowCategory } from '../index.js';
import type { FlowCategory, FlowEngineContext } from '../../types.js';

const baseContext: FlowEngineContext = {
  organizationId: 1,
  userId: 1,
  projectId: null,
  clientType: 'biotech',
};

const usSubmissionFlows: FlowCategory[] = ['ind_submission', 'nda_submission', 'bla_submission'];
const foreignApplications = ['EU_CTA', 'EU_MAA', 'CA_CTA', 'CA_NDS', 'JP_CTN', 'JP_MKT_APPROVAL'];

describe('document intake chooses only a matching native flow', () => {
  it.each([
    ['IND', 'ind_submission'],
    ['US_IND', 'ind_submission'],
    ['FDA IND submission', 'ind_submission'],
    ['Investigational new drug application', 'ind_submission'],
    ['NDA', 'nda_submission'],
    ['US_NDA', 'nda_submission'],
    ['New drug application', 'nda_submission'],
    ['BLA', 'bla_submission'],
    ['US_BLA', 'bla_submission'],
    ['Biologics license application', 'bla_submission'],
    ['ind_submission', 'ind_submission'],
    ['nda_submission', 'nda_submission'],
    ['bla_submission', 'bla_submission'],
  ])('preserves explicit US document name %s', (documentType, category) => {
    expect(resolveFlowCategory(documentType)).toBe(category);
  });

  it.each([
    'marketing application',
    'biologic',
    'biologics',
    'indication summary',
    'bladder evaluation',
    'standardization report',
    'labelled specimen',
  ])('does not infer a flow from an ambiguous name or word fragment: %s', documentType => {
    expect(resolveFlowCategory(documentType)).toBeNull();
  });

  it.each(foreignApplications)('does not assign %s to a US application interview', documentType => {
    expect(resolveFlowCategory(documentType)).toBeNull();
    expect(resolveFlowCategory(`${documentType} (IND-equivalent)`)).toBeNull();
    expect(resolveFlowCategory(`${documentType} (NDA-equivalent)`)).toBeNull();
    expect(resolveFlowCategory(`${documentType} (BLA-equivalent)`)).toBeNull();
  });

  it.each([
    'EU marketing application',
    'EMA NDA-equivalent marketing application',
    'European investigational new drug application',
    'Canadian new drug application',
    'Health Canada BLA-equivalent application',
    'Japanese NDA',
    'PMDA biologics license application',
    'New drug application (Japan)',
    'New drug application for Canada',
  ])('refuses a US submission flow for the foreign name %s', documentType => {
    expect(resolveFlowCategory(documentType)).toBeNull();
  });

  it.each([
    ['Clinical study report for an IND', 'csr_report'],
    ['Clinical study report summarizing the protocol', 'csr_report'],
    ['Safety narrative for IND', 'safety_narrative'],
    ['CMC specification for IND', 'cmc_specification'],
    ['Standard operating procedure for IND', 'sop_development'],
    ['Briefing document for BLA', 'briefing_book'],
    ['Stability study protocol', 'stability_study'],
    ['510(k) submission', 'device_510k'],
    ['EU_CTA clinical protocol', 'protocol_development'],
    ['CA_NDS clinical study report', 'csr_report'],
    ['JP_MKT_APPROVAL safety narrative', 'safety_narrative'],
  ])('selects the most specific document family for %s', (documentType, category) => {
    expect(resolveFlowCategory(documentType)).toBe(category);
  });
});

describe('explicit foreign submission context excludes US application interviews', () => {
  it.each([...foreignApplications, 'MAA', 'NDS', 'JNDA', 'EMA marketing application', 'Health Canada CTA', 'PMDA approval application'])(
    'refuses and hides IND/NDA/BLA for %s while retaining shared clinical flows',
    submissionType => {
      const context = { ...baseContext, submissionType };
      for (const category of usSubmissionFlows) {
        expect(getFlowDefinition(category, context)).toBeNull();
      }
      const available = getAvailableFlows(context).map(flow => flow.category);
      for (const category of usSubmissionFlows) expect(available).not.toContain(category);
      expect(getFlowDefinition('protocol_development', context)).not.toBeNull();
      expect(getFlowDefinition('csr_report', context)).not.toBeNull();
      expect(available).toContain('protocol_development');
      expect(available).toContain('csr_report');
    },
  );

  it.each([undefined, null, 'US_IND', 'US_NDA', 'US_BLA', 'IND', 'NDA', 'BLA'])(
    'preserves US application interviews for US or unspecified context %s',
    submissionType => {
      const context = { ...baseContext, submissionType };
      const available = getAvailableFlows(context).map(flow => flow.category);
      for (const category of usSubmissionFlows) {
        expect(getFlowDefinition(category, context)).not.toBeNull();
        expect(available).toContain(category);
      }
    },
  );
});
