// DERIVED, not observed: the round budget the stream computes for a turn.
// stream.ts calls resolveRoundBudget(effortUsed, runPolicy, resolveMaxRounds(effortUsed))
// (outside demo mode). This applies the SNAPSHOT's own pure functions to each
// effort x policy pair; it does not read anything the capture's server logged.
//   cd "$SNAP" && SNAP="$SNAP" npx tsx <this folder>/harness/round-budget.mts
// (Run from the snapshot tree so its tsconfig paths resolve.)
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SNAP = process.env.SNAP;
if (!SNAP) throw new Error('SNAP (the snapshot tree) is required');
const loop = await import(pathToFileURL(path.join(SNAP, 'server/services/ana/agentic-loop.ts')).href);
const { resolveRoundBudget, resolveMaxRounds } = loop;

for (const effortUsed of ['balanced', 'thorough', 'fast']) {
  for (const runPolicy of ['auto', 'manual', null]) {
    const b = resolveRoundBudget(effortUsed, runPolicy, resolveMaxRounds(effortUsed));
    console.info(JSON.stringify({ effortUsed, runPolicy, ...b, mostRoundsIfEachIsNew: b.roundCap ?? b.maxRounds + b.progressExtension }));
  }
}
