/**
 * D15 measurement on a SYNTHETIC BDS-shaped SAS transport file (every value
 * invented; no CDISC pilot data): heap held by readAdamDataset's rows.
 *   NODE_OPTIONS=--expose-gc npx tsx measure-reader-memory.mts <reader module path> [rows]
 * The reader path lets the same file measure the reader before the change (a
 * copy of HEAD's adam-dataset-reader.ts) and after it.
 */
import { xptWithRows } from '../../../../server/services/csr/__tests__/support/adam-xpt';

const [, , readerPath, rowArg] = process.argv;
const { readAdamDataset } = await import(readerPath) as typeof import('../../../../server/services/csr/adam-dataset-reader');
const ROWS = Number(rowArg ?? 60_000);
const PARAMS = ['Alanine Aminotransferase (U/L)', 'Albumin (g/L)', 'Bilirubin (umol/L)', 'Creatinine (umol/L)', 'Sodium (mmol/L)'];
const VISITS = ['Baseline', 'Week 2', 'Week 4', 'Week 8', 'Week 12', 'Week 16', 'Week 24', 'End of Treatment'];
const chars = Array.from({ length: 22 }, (_, i) => ({ name: `C${i}`, label: `C${i}`, type: 'char' as const, length: 40 }));
const nums = Array.from({ length: 22 }, (_, i) => ({ name: `N${i}`, label: `N${i}`, type: 'num' as const, length: 8 }));
const rows = Array.from({ length: ROWS }, (_, r) => [
  ...chars.map((_, c) => (c === 0 ? 'SYN-STUDY' : c === 1 ? `SYN-${Math.floor(r / 400)}` : c === 2 ? PARAMS[r % 5] : c === 3 ? VISITS[r % 8] : c % 3 ? 'Y' : 'Xanomeline-like arm (synthetic)')),
  ...nums.map((_, c) => (c === 0 ? r : (r * 7 + c) % 1000 / 10))]);
const bytes = xptWithRows('ADLBSYN', [...chars, ...nums], rows);
global.gc?.();
const before = process.memoryUsage().heapUsed;
const out = readAdamDataset(bytes, 'synthetic.xpt');
global.gc?.();
if (!out.ok) throw new Error(out.reason);
const heldMiB = (process.memoryUsage().heapUsed - before) / 1048576;
console.log(JSON.stringify({ reader: readerPath.split('/').slice(-1)[0], rows: out.dataset.rows.length, columns: out.dataset.columns.length,
  fileMiB: Math.round(bytes.length / 1048576 * 10) / 10, heldMiB: Math.round(heldMiB), heldBytesPerCell: Math.round(heldMiB * 1048576 / (out.dataset.rows.length * out.dataset.columns.length)) }));
