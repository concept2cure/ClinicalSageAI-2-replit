/**
 * Types for scripts/cre/prepare-public-reference-seed.mjs (plain ESM). `.d.mts`,
 * not `.d.ts`: TypeScript resolves a `.mjs` import only through `.mts` /
 * `.d.mts` (see scripts/db/migration-set.d.mts). Without it the pglite test
 * that imports it failed the pushed typecheck (TS7016, then TS7006 on every
 * callback over its rows).
 */
export declare const COLLECTION_DIRECTORY: string;
export declare const SEED_MIGRATION: string;

/** One seed row as the script builds it; its metadata is the manifest's, as read. */
export type ReferenceSeedRow = Record<string, any>;

export declare function compileReferenceSeed(manifest: unknown, root: string): {
  sql: string;
  rows: ReferenceSeedRow[];
  summary: {
    collectionId: string;
    retainedDocuments: number;
    catalogOnlyDocuments: number;
    totalSourceRecords: number;
    retainedPdfPages: number;
    originalBytes: number;
  } & Record<string, unknown>;
};
