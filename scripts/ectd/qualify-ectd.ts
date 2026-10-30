/**
 * Existing eCTD qualification CLI: explicit automated outcomes and local evidence.
 *
 * Missing schema/external proof is BLOCKED and exits nonzero. A technical pass
 * does not establish legal approval, qualified profile coverage or agency acceptance.
 *
 * npm run qualify:ectd
 * npm run qualify:ectd -- --region fda --no-v4 --report-dir ./qualification-reports
 * Repeated --region values select the existing supported v3 targets.
 */
import { runQualification, type RunQualificationOptions } from '../../server/services/ectd/qualification';
import { DEFAULT_V3_REGIONS } from '../../server/services/ectd/qualification/qualify';

function options(args: string[]): RunQualificationOptions {
  const result: RunQualificationOptions = { ranAt: new Date().toISOString() };
  const regions: NonNullable<RunQualificationOptions['v3Regions']> = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-v4') { result.includeV4 = false; continue; }
    if (!['--region', '--report-dir', '--work-dir'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    if (arg === '--region') {
      const region = DEFAULT_V3_REGIONS.find(candidate => candidate === value);
      if (!region) throw new Error(`Unsupported qualification region: ${value}`);
      regions.push(region);
    } else if (arg === '--report-dir') result.reportDir = value;
    else result.workDir = value;
  }
  if (regions.length) result.v3Regions = [...new Set(regions)];
  return result;
}

type Outcome = { status?: string; passed?: boolean };
function label(outcome: Outcome): 'PASSED' | 'FAILED' | 'BLOCKED' {
  if (outcome.status === 'passed' && outcome.passed === true) return 'PASSED';
  return outcome.status === 'failed' ? 'FAILED' : 'BLOCKED';
}
const write = (line: string) => process.stdout.write(`${line}\n`);

function validationLabel(result: { ran: boolean; passed: boolean; errorCount: number }): string {
  if (!result.ran) return 'not run';
  if (result.passed) return 'ok';
  return result.errorCount > 0 ? `${result.errorCount} error(s)` : 'unverified';
}

async function main(): Promise<void> {
  const summary = await runQualification(options(process.argv.slice(2)));
  write(`\neCTD qualification — ${summary.ranAt}`);
  write(`Reports: ${summary.reportDir}\n`);
  for (const report of summary.reports) {
    write(`[${label(report)}] ${report.id}  (${report.region.toUpperCase()} ${report.version})`);
    write(`        · available local checks: ${report.availableChecksPassed ? 'passed' : 'not all passed'}`);
    for (const validator of report.validators) {
      write(`        · ${validator.name}: ${validationLabel(validator)}`);
    }
    write(`        · checksums: ${report.checksum.filesChecked} verified, ${report.checksum.mismatches.length} mismatch(es)`);
    write(`        · lifecycle (${report.lifecycle.operations.join('/')}): ${label({ status: report.lifecycle.status, passed: report.lifecycle.nextPackagePassed })}`);
    for (const reason of report.blockers ?? []) write(`        · blocker: ${reason}`);
  }
  for (const reason of summary.blockers ?? []) write(`Blocker: ${reason}`);
  write(`\nOverall: ${label(summary)}\n`);
  write('Scope: automated package validation; no legal, licence, human or agency acceptance is established.');
  process.exit(label(summary) === 'PASSED' ? 0 : 1);
}

main().catch(error => {
  process.stderr.write(`Qualification run failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
