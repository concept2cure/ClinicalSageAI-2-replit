import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BETA_510K_TAB,
  isBeta510kTab,
  resolveBetaInitialTab,
} from '../../client/src/pages/csr/cerv2BetaFlowConfig';

describe('cerv2 beta flow config', () => {
  it('recognizes guided hero tabs', () => {
    expect(isBeta510kTab('device-intake')).toBe(true);
    expect(isBeta510kTab('submission')).toBe(true);
    expect(isBeta510kTab('pma-search')).toBe(false);
  });

  it('resolves invalid initial tabs to beta default', () => {
    expect(resolveBetaInitialTab('pma-search')).toBe(DEFAULT_BETA_510K_TAB);
    expect(resolveBetaInitialTab(undefined)).toBe(DEFAULT_BETA_510K_TAB);
  });

  it('retains valid beta initial tabs', () => {
    expect(resolveBetaInitialTab('equivalence')).toBe('equivalence');
  });
});
