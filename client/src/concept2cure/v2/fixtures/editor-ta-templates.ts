/**
 * Barrel re-export for editor TA + template data -- ported from concept2cure-v2:
 *   app/editor-ta-templates.jsx
 *
 * Consumers import from this file:
 *   import { REG_TA, REG_TA_GROUPS, REG_TEMPLATES, ... } from '../fixtures/editor-ta-templates';
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Re-export types ---- */

export type { TherapeuticArea, TherapeuticAreaGroup } from './editor-ta-data';
export type { TemplateItem, TemplateGroup } from './editor-templates-data';

/* ---- Re-export TA data ---- */

export { REG_TA, REG_TA_GROUPS } from './editor-ta-data';

/* ---- Compose REG_TEMPLATES from split files ---- */

import { REG_TEMPLATES_CORE } from './editor-templates-data';
import type { TemplateGroup } from './editor-templates-data';
import { REG_TEMPLATES_EXTENDED } from './editor-templates-data-extended';

export const REG_TEMPLATES: Record<string, readonly TemplateGroup[]> = {
  ...REG_TEMPLATES_CORE,
  ...REG_TEMPLATES_EXTENDED,
};

/* ---- Computed values ---- */

export const TEMPLATE_COUNT: number = Object.values(REG_TEMPLATES).reduce(
  (sum, groups) => sum + groups.reduce((gs, g) => gs + g.items.length, 0),
  0,
);

export const TEMPLATE_PATHWAY_COUNT: number = Object.keys(REG_TEMPLATES).length;
