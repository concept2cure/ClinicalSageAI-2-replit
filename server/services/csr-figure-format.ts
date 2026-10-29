/**
 * A figure to `places` decimals, rounded half away from zero on its decimal
 * value, as SAS TLFs round (CDISC pilot defect D13, 2026-10-30). toFixed rounds
 * the binary value, so (60.0 + 60.1) / 2 printed "60.0". The scaled value is
 * read to 12 significant digits first, which absorbs binary representation
 * error and nothing a dataset records. A negative figure that rounds to zero
 * prints as 0.
 */
export function roundHalfUp(value: number, places: number): string {
  if (!Number.isFinite(value)) return String(value);
  const scaled = Number((Math.abs(value) * 10 ** places).toPrecision(12));
  const rounded = Math.round(scaled);
  return ((value < 0 && rounded !== 0 ? -rounded : rounded) / 10 ** places).toFixed(places);
}
