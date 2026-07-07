// @vitest-environment jsdom
/**
 * ENABLE_UI_V2 gate + runtime overrides (?ui-v2= / localStorage 'c2c-ui-v2').
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { featureFlags, setFeatureEnabled } from '@/flags/featureFlags';
import { isUiV2Enabled } from '../uiV2Flag';

describe('isUiV2Enabled', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    setFeatureEnabled('ENABLE_UI_V2', featureFlags.ENABLE_UI_V2.defaultValue);
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    setFeatureEnabled('ENABLE_UI_V2', featureFlags.ENABLE_UI_V2.defaultValue);
  });

  it('ships dark: defaults to the flag default (false)', () => {
    expect(featureFlags.ENABLE_UI_V2.defaultValue).toBe(false);
    expect(isUiV2Enabled()).toBe(false);
  });

  it('follows the feature flag when no override is present', () => {
    setFeatureEnabled('ENABLE_UI_V2', true);
    expect(isUiV2Enabled()).toBe(true);
  });

  it('localStorage override wins over the flag', () => {
    localStorage.setItem('c2c-ui-v2', '1');
    expect(isUiV2Enabled()).toBe(true);
    localStorage.setItem('c2c-ui-v2', '0');
    setFeatureEnabled('ENABLE_UI_V2', true);
    expect(isUiV2Enabled()).toBe(false);
  });

  it('URL param wins and persists to localStorage', () => {
    window.history.replaceState({}, '', '/concept2cure?ui-v2=1');
    expect(isUiV2Enabled()).toBe(true);
    expect(localStorage.getItem('c2c-ui-v2')).toBe('1');
    window.history.replaceState({}, '', '/concept2cure');
    expect(isUiV2Enabled()).toBe(true); // persisted
  });
});
