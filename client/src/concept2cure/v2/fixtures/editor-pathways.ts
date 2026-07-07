// Barrel re-export for regulatory pathway editor fixtures.
// Usage: import { REG_PATHWAYS, FILING_TO_PATHWAY } from '../fixtures/editor-pathways';

export type {
  Section,
  Volume,
  Pathway,
  PathwayMap,
  FilingToPathwayMap,
  SectionStatus,
} from './editor-pathways-types';
export { makeSection } from './editor-pathways-types';

export * from './editor-pathways-ctd';
export * from './editor-pathways-device';
export * from './editor-pathways-lifecycle';

import type { PathwayMap } from './editor-pathways-types';
import { CTD_PATHWAYS } from './editor-pathways-ctd';
import { DEVICE_PATHWAYS } from './editor-pathways-device';
import { LIFECYCLE_PATHWAYS } from './editor-pathways-lifecycle';

/** All regulatory pathways merged into a single lookup map. */
export const REG_PATHWAYS: PathwayMap = {
  ...CTD_PATHWAYS,
  ...DEVICE_PATHWAYS,
  ...LIFECYCLE_PATHWAYS,
};

/** Total number of pathway entries. */
export const PATHWAY_COUNT: number = Object.keys(REG_PATHWAYS).length;
