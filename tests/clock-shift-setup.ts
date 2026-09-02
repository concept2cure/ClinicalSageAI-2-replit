/**
 * Moves the wall clock forward for a whole test run, so a test that grades the
 * calendar instead of the code fails NOW rather than on the day its fixture
 * expires.
 *
 * Why this exists: server/routes/__tests__/client-portal.test.ts sat red on the
 * trunk for a full session. Nothing had regressed. A fixture pinned
 * target_end_date at 2026-09-01 and asserted the rendered string matched
 * /milestone/, which was true only until 2026-09-01 actually arrived. A suite
 * that goes red without a defect is worse than no suite: a red nobody can act
 * on is how a real failure gets waved through.
 *
 * Fixing the one that had already fired says nothing about the ones that have
 * not. Run the suite twice — once normally, once through this config — and diff
 * the failures. Anything failing only in the shifted run is a latent one:
 *
 *   npm run test:clock-shift
 *
 * Its first run over the whole suite found exactly two, one of them three weeks
 * from firing (licensing-trials' hardcoded FUTURE date).
 *
 * Only "now" moves. `new Date(x)` for an explicit x is untouched, so fixtures
 * parse exactly as they always did; it is the meaning of the present that
 * changes. A test that already freezes its own clock (vi.setSystemTime) is
 * unaffected, which is the point — that is the fix this diagnostic asks for.
 */
const SHIFT_MS = Number(process.env.TIME_SHIFT_DAYS || '365') * 86_400_000;
const RealDate = Date;

class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + SHIFT_MS);
    // @ts-expect-error variadic pass-through to the real Date constructor
    else super(...args);
  }
  static now(): number {
    return RealDate.now() + SHIFT_MS;
  }
}

// @ts-expect-error deliberate global override for the duration of the run
globalThis.Date = ShiftedDate;
