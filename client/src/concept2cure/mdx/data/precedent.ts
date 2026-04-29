/**
 * Precedent Intelligence fixtures — saved queries on the Precedent surface.
 * The cross-agency narrative bullets are inline in PrecedentSurface for now.
 */

export interface SavedQuery {
  q: string;
  hits: number;
  saved: boolean;
}

export const PI_QUERIES: SavedQuery[] = [
  { q: 'CGM sensor 14-day wear',     hits: 47,  saved: true },
  { q: 'IVD cartridge 14 analytes',  hits: 23,  saved: true },
  { q: 'Implantable cardiac monitor', hits: 182, saved: false },
  { q: 'Software as medical device',  hits: 419, saved: false },
];
