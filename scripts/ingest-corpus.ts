/**
 * CT.gov corpus ingestion runner — the ops entrypoint the pipeline was missing.
 *
 * The ingestion pipeline (server/services/corpus) was built and tested but had
 * no runnable entrypoint, so the corpus stayed empty (GA gap audit Tier-1 #2).
 * This wires the live fetcher + Drizzle writer + orchestrator behind a small
 * CLI, requiring a real DATABASE_URL and outbound access to clinicaltrials.gov.
 *
 * Usage:
 *   tsx scripts/ingest-corpus.ts --indication "melanoma" --phase 3 --limit 100
 *   tsx scripts/ingest-corpus.ts --intervention pembrolizumab --sponsor Merck
 *   tsx scripts/ingest-corpus.ts --dry-run --indication melanoma   # fetch+normalize, no write
 *
 * Idempotent: studies are keyed by NCT id, so re-runs update rather than
 * duplicate. Prints an honest summary (fetched/normalized/inserted/updated/
 * skipped/errors) and exits non-zero if every fetched study failed to write.
 *
 * See docs/runbooks/corpus-ingestion.md for the full operational guide.
 */

import { ingestCtgov, type CtgovIngestQuery } from '../server/services/corpus/ingest-ctgov';
import { LiveCtgovFetcher } from '../server/services/corpus/live-ctgov-fetcher';
import { normalizeCtgovStudy } from '../server/services/corpus/ctgov-normalizer';

interface CliArgs extends CtgovIngestQuery {
  dryRun: boolean;
  organizationId?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--indication': args.indication = next(); break;
      case '--intervention': args.intervention = next(); break;
      case '--sponsor': args.sponsor = next(); break;
      case '--phase': args.phase = next(); break;
      case '--limit': args.limit = Number(next()); break;
      case '--org': args.organizationId = Number(next()); break;
      case '--dry-run': args.dryRun = true; break;
      case '--help':
        console.log('Usage: tsx scripts/ingest-corpus.ts --indication <cond> [--intervention <x>] [--sponsor <s>] [--phase 1|2|3|4] [--limit N] [--org ID] [--dry-run]');
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${a}`);
        process.exit(2);
    }
  }
  if (!args.indication && !args.intervention && !args.sponsor) {
    console.error('Provide at least one of --indication, --intervention, --sponsor. Use --help for usage.');
    process.exit(2);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const query: CtgovIngestQuery = {
    indication: args.indication,
    intervention: args.intervention,
    sponsor: args.sponsor,
    phase: args.phase,
    limit: args.limit,
  };

  if (args.dryRun) {
    // Prove fetch + normalize without touching the DB.
    const studies = await new LiveCtgovFetcher().fetchStudies(query);
    let normalized = 0;
    for (const s of studies) if (normalizeCtgovStudy(s)) normalized++;
    console.log(JSON.stringify({ mode: 'dry-run', fetched: studies.length, normalized }, null, 2));
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for a write run. Use --dry-run to fetch+normalize without a DB.');
    process.exit(2);
  }

  // Import the DB-backed writer lazily so --dry-run never opens a pool.
  const { ingestCtgovToCorpus } = await import('../server/services/corpus/index');
  const summary = await ingestCtgovToCorpus(query, args.organizationId);
  console.log(JSON.stringify({ mode: 'write', ...summary }, null, 2));

  if (summary.fetched > 0 && summary.inserted + summary.updated === 0) {
    console.error('Every fetched study failed to write — see failures above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Corpus ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// Exported only so the orchestrator stays referenced for typecheck tooling.
export { ingestCtgov };
