/** Project/store projections of the existing clinical document records. */
import type { SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';
import { ICH_E2F_DSUR_SECTIONS } from '../../../ind/ctd/lifecycle-document-types.js';
import { e3TopLevel, e3Children } from '../../../ind/ctd/csr-e3-guidance.js';

// Module 0 means a standalone document's authoring sections, not CTD placement.
// Filing location and regional additions must be selected for the receiving agency.
export const dsurSectionBlueprint: SectionBlueprint = {
  id: 'ich_dsur_sections',
  name: 'DSUR Sections (ICH E2F reference structure)',
  sections: ICH_E2F_DSUR_SECTIONS.map(s => ({
    code: s.number ?? s.title.toLowerCase().replace(/\s+/g, '_'),
    title: s.title, module: 0, required: s.required, contentType: 'mixed',
    guidance: `${s.guidance} Basis: ${s.basis.map(b => b.ref).join('; ')}.`,
  })),
};

export const csrSectionBlueprint: SectionBlueprint = {
  id: 'ich_csr_sections',
  name: 'CSR Sections (ICH E3 reference structure)',
  sections: e3TopLevel().map(s => ({
    code: s.number, title: s.title, module: 0,
    required: s.applies === 'always', contentType: 'mixed',
    guidance: s.purpose ?? (s.contains?.length
      ? s.contains.join('; ')
      : `Covers ${e3Children(s.number).map(c => `${c.number} ${c.title}`).join('; ')}.`),
  })),
};
