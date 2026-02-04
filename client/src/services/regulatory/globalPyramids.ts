/**
 * Global Submission Pyramids
 * Placeholder service for global regulatory pyramids
 */

export type GlobalSubmissionType = 
  | 'HEALTH_CANADA'
  | 'PMDA'
  | 'TGA'
  | 'EU_MDR';

export interface GlobalPyramidConfig {
  id: string;
  name: string;
  region: string;
  submissionType: GlobalSubmissionType;
  description?: string;
}

// Placeholder data
export const GLOBAL_PYRAMIDS: GlobalPyramidConfig[] = [];

export function getGlobalPyramid(id: string): GlobalPyramidConfig | undefined {
  return GLOBAL_PYRAMIDS.find(p => p.id === id);
}

export function getAvailableGlobalSubmissions(): GlobalSubmissionType[] {
  return ['HEALTH_CANADA', 'PMDA', 'TGA', 'EU_MDR'];
}

export function getPyramidsByRegion(region: string): GlobalPyramidConfig[] {
  return GLOBAL_PYRAMIDS.filter(p => p.region === region);
}
