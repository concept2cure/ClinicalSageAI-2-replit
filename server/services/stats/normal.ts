/**
 * Standard-normal helpers: density, CDF, and quantile (inverse CDF).
 *
 * These are the canonical implementations for the stats engine. High-accuracy
 * approximations are used so they are safe for the recursive numerical
 * integration in the group-sequential OC engine (group-sequential-oc.ts):
 *   - CDF: W. J. Cody's rational Chebyshev approximation (Cody 1969, as
 *     revised 1993 and used by R's pnorm), relative error ~1e-16 across the
 *     range, including the far tails (Φ(−10) ≈ 7.6e−24 to full precision).
 *   - quantile: Acklam's rational approximation (relative error < 1.15e-9),
 *     refined by one Halley step against that CDF to ~1e-15.
 *
 * 2026-10-05: the CDF was Abramowitz & Stegun 26.2.17 (|error| < 7.5e-8), and
 * the quantile's Halley step refined Acklam's estimate AGAINST it, so the
 * "refined" quantile carried the CDF's error: z(0.975) came out 1.95996280
 * against 1.95996398. Every sample size, power and boundary in the engine is
 * built on these two functions (tests/biostat/normal-precision-reference.test.ts).
 *
 * Pure and runtime-agnostic. (Two services — adaptive-trial-operations-service
 * and power-sample-size-service — still carry private copies of equivalent
 * functions; those can be migrated onto this module in a later pass.)
 */

/** Standard normal probability density function. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/* Cody's coefficients (R nmath/pnorm.c, pnorm_both), written in their shortest
   round-trip form: each literal is the same double R's longer spelling parses to. */
const CODY_A = [
  2.2352520354606837, 161.02823106855587, 1067.6894854603709,
  18154.98125334356, 0.06568233791820745,
];
const CODY_B = [
  47.202581904688245, 976.0985517377767, 10260.932208618979,
  45507.78933502673,
];
const CODY_C = [
  0.39894151208813466, 8.883149794388377, 93.50665613217785,
  597.2702763948002, 2494.5375852903726, 6848.190450536283,
  11602.65143764735, 9842.714838383978, 1.0765576773720192e-8,
];
const CODY_D = [
  22.266688044328117, 235.387901782625, 1519.3775994075547,
  6485.558298266761, 18615.571640885097, 34900.95272114598,
  38912.00328609327, 19685.429676859992,
];
const CODY_P = [
  0.215898534057957, 0.12740116116024736, 0.022235277870649807,
  0.0014216191932278934, 0.000029112874951168793, 0.023073441764940174,
];
const CODY_Q = [
  1.284260096144911, 0.4682382124808651, 0.06598813786892856,
  0.0037823963320275824, 0.00007297515550839662,
];
const SQRT32 = 5.656854249492381;
const ONE_OVER_SQRT_2PI = 0.3989422804014327;

/** exp(−y²/2), split as R does so the product keeps full precision in the tail. */
function gaussianTail(y: number): number {
  const ysq = Math.trunc(y * 16) / 16;
  const del = (y - ysq) * (y + ysq);
  return Math.exp(-ysq * ysq * 0.5) * Math.exp(-del * 0.5);
}

/**
 * Standard normal cumulative distribution function.
 * Cody's rational Chebyshev approximation; relative error ~1e-16.
 */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const y = Math.abs(x);
  if (y <= 0.67448975) {
    // |x| below the quartile: Φ(x) = ½ + x·R(x²).
    let xnum = 0;
    let xden = 0;
    if (y > 1.11e-16) {
      const xsq = x * x;
      xnum = CODY_A[4] * xsq;
      xden = xsq;
      for (let i = 0; i < 3; i++) {
        xnum = (xnum + CODY_A[i]) * xsq;
        xden = (xden + CODY_B[i]) * xsq;
      }
    }
    return 0.5 + (x * (xnum + CODY_A[3])) / (xden + CODY_B[3]);
  }
  let tail: number;
  if (y <= SQRT32) {
    let xnum = CODY_C[8] * y;
    let xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + CODY_C[i]) * y;
      xden = (xden + CODY_D[i]) * y;
    }
    tail = gaussianTail(y) * ((xnum + CODY_C[7]) / (xden + CODY_D[7]));
  } else if (y < 38) {
    const xsq = 1 / (x * x);
    let xnum = CODY_P[5] * xsq;
    let xden = xsq;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + CODY_P[i]) * xsq;
      xden = (xden + CODY_Q[i]) * xsq;
    }
    const r = (xsq * (xnum + CODY_P[4])) / (xden + CODY_Q[4]);
    tail = gaussianTail(y) * ((ONE_OVER_SQRT_2PI - r) / y);
  } else {
    tail = 0;
  }
  return x > 0 ? 1 - tail : tail;
}

/**
 * Inverse standard normal CDF (quantile). Acklam's rational approximation,
 * refined by one Halley step against the Cody CDF above.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  // One Halley refinement step against the Cody CDF.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  x = x - u / (1 + (x * u) / 2);
  return x;
}
