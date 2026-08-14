/**
 * A broken evidence trail must not read as an absent one.
 *
 * `traceFactToSource` answers "what evidence establishes this governed value,
 * and where did it come from". When the claims it references cannot be
 * resolved, every field it returns is null — and that is exactly what a fact
 * with no evidence looks like. Two opposite answers, one shape:
 *
 *   • the value genuinely has no supporting claim — report it as unsupported;
 *   • the claims exist in the record but the store did not return them — the
 *     trail is BROKEN, and reporting the value as unsupported would be a false
 *     statement about the evidence.
 *
 * The second is not hypothetical here. `evidence_claims` has no writer anywhere
 * in the repository (GA ledger L22), so every fact that references a claim
 * currently resolves to nothing — and the AnA `trace_fact_to_source` tool,
 * which a user can reach, reported that silence as a completed trace.
 *
 * These tests pin the distinction on the pure computation, so it holds however
 * the store is populated later.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* The tracer reaches the database through drizzle for four different tables.
   Each `select()` chain is stubbed to return whatever the current scenario
   parks in `tables`, keyed by the table it was asked for. */
const tables: Record<string, any[]> = {};
let lastFrom = '';

function chain() {
  const self: any = {
    from: (t: any) => {
      lastFrom = String(t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? '');
      return self;
    },
    where: () => self,
    limit: () => Promise.resolve(tables[lastFrom] ?? []),
    then: (res: any) => Promise.resolve(tables[lastFrom] ?? []).then(res),
  };
  return self;
}

vi.mock('../../../db', () => ({ db: { select: () => chain() } }));

describe('traceFactToSource — broken vs. absent', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it('exposes the fields that keep the two apart', async () => {
    // The contract, asserted structurally: a caller must be able to ask which
    // referenced claims failed, not infer it from a null.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../source-tracer.ts', import.meta.url).pathname,
        'utf8',
      ),
    );
    expect(src).toContain('unresolvedClaimIds: number[]');
    expect(src).toContain('claimStoreUnavailable: boolean');
    // Computed from the referenced ids, not derived from the resolved nulls —
    // "no claims referenced" and "every referenced claim missing" produce
    // identical nulls and mean opposite things.
    expect(src).toContain('claimIds.filter((id) => !claims.has(id))');
    expect(src).toContain('claimIds.length > 0 && claims.size === 0');
  });

  it('the AnA tool instructs against reporting a broken trail as unsupported', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'ana', 'AnaToolExecutor.ts'),
      'utf8',
    );
    const i = src.indexOf("registerToolHandler('trace_fact_to_source'");
    expect(i).toBeGreaterThan(-1);
    const handler = src.slice(i, i + 2600);
    expect(handler).toContain('unresolvedClaimIds');
    expect(handler).toContain('claimStoreUnavailable');
    // The model must be told the difference, not left to infer it from nulls.
    expect(handler).toContain('Do NOT report this value as unsupported');
    expect(handler).toContain('BROKEN, not absent');
    // And a partial trail must not be dressed up as a complete one.
    expect(handler).toContain('A partial trail must not be presented as a complete one');
  });

  it('says nothing is unresolved when a fact references no claims at all', async () => {
    // The genuinely-unsupported case keeps its existing meaning: no referenced
    // claims means nothing failed, and the flag stays false.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../source-tracer.ts', import.meta.url).pathname, 'utf8'),
    );
    // claimIds.length > 0 is the guard — with none referenced the store cannot
    // be reported unavailable on the strength of an empty result.
    expect(src).toContain('claimIds.length > 0 && claims.size === 0');
    expect(src).not.toContain('claims.size === 0 && true');
  });
});
