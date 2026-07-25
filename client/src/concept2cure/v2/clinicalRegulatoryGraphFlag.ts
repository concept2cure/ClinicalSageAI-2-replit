/**
 * Clinical-Regulatory Intelligence Graph rollout switch.
 *
 * Mirrors the uiV2Flag.ts pattern: the ENABLE_CLINICAL_REGULATORY_GRAPH feature
 * flag (client/src/flags/featureFlags.ts) is canonical, with two runtime
 * overrides so the graph can be verified against a running backend without a
 * rebuild:
 *
 *   - localStorage 'c2c-crl-graph' = '1' | '0'   (sticky per browser)
 *   - URL ?crl-graph=1 | ?crl-graph=0            (persisted to localStorage so
 *                                                 SPA route changes keep it)
 *
 * Flip order: explicit URL param > localStorage > feature flag default.
 *
 * ── What "off" means ───────────────────────────────────────────────────────
 *
 * Off restores the current UI EXACTLY: the `crl-library` rail entry is absent,
 * the CSR board's regulatory-outcome and FDA-findings columns do not render, the
 * study-design evidence accordions do not render, and the three evidence report
 * types are not offered. No half-state — a column header with nothing behind it
 * would advertise a capability the deployment does not have.
 *
 * The client flag is a RENDERING gate, not a security boundary. The server flag
 * of the same name gates the routes themselves (404 when off), so flipping this
 * one on against a server that has it off yields honest error states rather than
 * access to anything.
 */
import { isFeatureEnabled } from '@/flags/featureFlags';

const STORAGE_KEY = 'c2c-crl-graph';

function readOverride(): boolean | null {
  try {
    const qs = new URLSearchParams(window.location.search);
    const param = qs.get('crl-graph');
    if (param === '1' || param === '0') {
      try {
        localStorage.setItem(STORAGE_KEY, param);
      } catch {
        /* storage unavailable — param still applies this load */
      }
      return param === '1';
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* SSR / storage denied — fall through to the flag */
  }
  return null;
}

export function isClinicalRegulatoryGraphEnabled(): boolean {
  const override = readOverride();
  if (override !== null) return override;
  return isFeatureEnabled('ENABLE_CLINICAL_REGULATORY_GRAPH');
}
