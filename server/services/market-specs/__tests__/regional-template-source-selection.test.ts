import { describe, expect, it } from 'vitest';
import { getDocumentTemplate, getRegistryDocumentTemplate } from '../document-template-library';
import { getLifecycleDocumentType } from '../../ind/ctd';

describe('regional template source selection', () => {
  it('EU PSUR uses every numbered section of the canonical PBRER, and its front matter', async () => {
    const canonical = getDocumentTemplate('pbrer')!;
    const actual = await getRegistryDocumentTemplate('EU_PSUR');
    expect(actual?.sections).toEqual(canonical.sections);
    expect(actual?.frontMatter).toEqual(canonical.frontMatter);
    // §20 Appendices added 2026-10-18 (review finding).
    expect(actual?.sections.map(section => section.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => String(index + 1)),
    );
  });

  it('NDA/BLA annual reports use the post-approval lifecycle record, not IND annual headings', async () => {
    const canonical = getLifecycleDocumentType('nda_bla_annual_report')!;
    const actual = await getRegistryDocumentTemplate('US_NDA_ANNUAL');
    expect(actual?.sections.map(section => ({ code: section.number, title: section.heading }))).toEqual(
      canonical.components.map(component => ({ code: component.code, title: component.title })),
    );
    expect(actual?.regulatoryBasis).toContain('314.81');
    expect(actual?.sections[0]?.heading).toContain('2252');
    expect(actual?.outlineSource).toEqual({
      kind: 'lifecycle-record', registryId: 'US_NDA_ANNUAL', record: 'LIFECYCLE_DOCUMENT_TYPES:nda_bla_annual_report',
    });
  });
});
