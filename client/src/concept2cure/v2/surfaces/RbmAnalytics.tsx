/**
 * RbmAnalytics -- AnA, docked and RBM-scoped (ported from rbm-ana.jsx).
 *
 * Not a generic chatbox: a parallel actuator of the same 9 RBM tools the
 * surface buttons run. Per-surface starters, grounded structured results
 * read from the RBM engines' output, deep-links into surfaces, and
 * cross-module hand-off to Biostatistics for estimand/power impact.
 *
 * Coordination note: this file's public surface (the resolver + the docked
 * assistant) was already ported into RbmSurfaces.tsx -- the shared RBM kit
 * hub that Rbm.tsx, RbmSurfacesA.tsx and RbmSurfacesB.tsx all import from.
 * Re-implementing it here under the rbm-ana.jsx file name would create a
 * second copy of the resolver that could silently drift from the one
 * actually wired into the rbm surface (Rbm.tsx). Instead this module
 * re-exports the RBM AnA dock so the kit's file-for-file port map has a named
 * home, with RbmSurfaces.tsx remaining the single source of truth. (The former
 * rbmAnaResolve heuristic was removed when the dock was wired to the real
 * streaming assistant — see RbmSurfaces.tsx.)
 */
export { RbmAnaDock, type RbmAnaMessage } from './RbmSurfaces';
