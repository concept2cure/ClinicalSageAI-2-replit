/**
 * ui-v2 rollout switch.
 *
 * The ENABLE_UI_V2 feature flag (client/src/flags/featureFlags.ts) is the
 * canonical gate for the full UI replacement. Because the flag table ships
 * static, this helper adds two runtime overrides so the new shell can be
 * verified against a running backend without a rebuild:
 *
 *   - localStorage 'c2c-ui-v2' = '1' | '0'   (sticky per browser)
 *   - URL ?ui-v2=1 | ?ui-v2=0                (one navigation; persisted to
 *                                             localStorage so SPA route
 *                                             changes keep the choice)
 *
 * Flip order: explicit URL param > localStorage > feature flag default.
 */
import { isFeatureEnabled } from '@/flags/featureFlags';

const STORAGE_KEY = 'c2c-ui-v2';

function readOverride(): boolean | null {
  try {
    const qs = new URLSearchParams(window.location.search);
    const param = qs.get('ui-v2');
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

export function isUiV2Enabled(): boolean {
  const override = readOverride();
  if (override !== null) return override;
  return isFeatureEnabled('ENABLE_UI_V2');
}
