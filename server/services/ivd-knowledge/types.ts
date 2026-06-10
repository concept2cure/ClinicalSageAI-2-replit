/**
 * IVD knowledge base — server-side type surface.
 *
 * Re-exports the canonical, client-shared type contract from shared/ivd/types
 * so server and UI never drift. New code may import from either location; the
 * definitions live in shared/ivd/types.ts.
 */

export * from '../../../shared/ivd/types';
