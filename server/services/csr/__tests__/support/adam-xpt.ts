/**
 * SAS transport v5 files with real observations, for the ADaM reader's tests.
 * Headers come from the Data Room reader's byte-level fixture; observations are
 * encoded here (IBM System/370 doubles, blank-padded text, '.' for missing).
 */
import { library, member, REC, type Var } from '../../../clinical-regulatory-evidence/__tests__/support/xpt-fixture';

/** IBM System/370 double: sign, excess-64 base-16 exponent, 56-bit fraction. */
export function toIbm(x: number): Buffer {
  const out = Buffer.alloc(8);
  if (x === 0) return out;
  let f = Math.abs(x);
  let e = 0;
  while (f >= 1) { f /= 16; e++; }
  while (f < 1 / 16) { f *= 16; e--; }
  const fraction = BigInt(Math.round(f * 2 ** 56));
  out[0] = (x < 0 ? 0x80 : 0) | (e + 64);
  for (let i = 7; i >= 1; i--) out[i] = Number((fraction >> BigInt(8 * (7 - i))) & 0xffn);
  return out;
}

/** A one-member transport file whose observations carry the given values. */
export function xptWithRows(name: string, vars: Var[], rows: Array<Array<string | number | null>>): Buffer {
  const obs = Buffer.concat(rows.flatMap(row => row.map((value, i) => {
    const v = vars[i];
    if (v.type === 'char') return Buffer.from(String(value ?? '').padEnd(v.length, ' ').slice(0, v.length), 'latin1');
    if (value === null) return Buffer.concat([Buffer.from('.', 'latin1'), Buffer.alloc(v.length - 1)]);
    return toIbm(Number(value)).subarray(0, v.length);
  })));
  const padded = Buffer.concat([obs, Buffer.alloc((REC - (obs.length % REC)) % REC, 0x20)]);
  return library(Buffer.concat([member(name, `${name} (synthetic)`, vars, 0), padded]));
}
