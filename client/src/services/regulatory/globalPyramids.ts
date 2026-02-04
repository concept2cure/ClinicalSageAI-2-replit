/**
 * Global Submission Pyramids Service
 * 
 * This is a placeholder service for global regulatory pyramids.
 * Currently exports empty data structures as stubs.
 * 
 * TODO: Implement actual data population when global submission features are developed.
 * This service should eventually:
 * - Load pyramid configurations from database or configuration files
 * - Provide filtering and querying capabilities for different regulatory regions
 * - Support CRUD operations for pyramid management
 * 
 * For now, it exists to satisfy import requirements in the codebase.
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

// Placeholder data - will be populated when global submission features are implemented
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
