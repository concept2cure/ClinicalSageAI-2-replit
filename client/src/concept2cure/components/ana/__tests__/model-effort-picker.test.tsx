// @vitest-environment jsdom
/**
 * Model/effort picker — component tests.
 *
 *   - Composer renders the picker ONLY when the flag is on AND a handler is wired.
 *   - The effort control exposes role="radiogroup" with three radios.
 *   - BOTH EmptyState and ChatView forward the effort/model props to Composer.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { setFeatureEnabled } from '@/flags/featureFlags';
import { Composer } from '../Composer';
import { EmptyState } from '../EmptyState';
import { ChatView } from '../ChatView';
import { __resetModelCache } from '../ModelEffortPicker';

// The picker lazy-fetches /api/claude/models on mount. Stub fetch so the effort
// control renders deterministically; the model dropdown only appears once
// models resolve, which we don't assert here.
beforeEach(() => {
  __resetModelCache();
  // jsdom doesn't implement scrollIntoView (ChatView calls it on mount).
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { models: [] } }),
    }),
  );
});

afterEach(() => {
  cleanup();
  setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', false);
  vi.unstubAllGlobals();
});

describe('Composer — picker flag gating', () => {
  it('does NOT render the effort control when the flag is off', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', false);
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        effort="balanced"
        onEffortChange={() => {}}
      />,
    );
    expect(screen.queryByRole('radiogroup', { name: 'Response effort' })).toBeNull();
  });

  it('does NOT render the picker when the flag is on but no handler is wired', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    render(<Composer value="" onChange={() => {}} onSend={() => {}} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('renders the effort radiogroup with three radios when flag on + handler wired', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        effort="balanced"
        onEffortChange={() => {}}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Response effort' });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(3);
    // The current effort is reflected as the checked radio.
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked.length).toBe(1);
  });

  it('fires onEffortChange when a different effort is chosen', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    const onEffortChange = vi.fn();
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        effort="balanced"
        onEffortChange={onEffortChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Thorough effort/ }));
    expect(onEffortChange).toHaveBeenCalledWith('thorough');
  });

  it('roving tabindex: only the checked radio is in the tab order', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        effort="balanced"
        onEffortChange={() => {}}
      />,
    );
    const radios = screen.getAllByRole('radio');
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable.length).toBe(1);
    expect(tabbable[0].getAttribute('aria-checked')).toBe('true');
  });

  it('arrow keys move selection within the radiogroup', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    const onEffortChange = vi.fn();
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        effort="balanced"
        onEffortChange={onEffortChange}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Response effort' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onEffortChange).toHaveBeenLastCalledWith('thorough');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onEffortChange).toHaveBeenLastCalledWith('fast');
  });
});

describe('EmptyState forwards effort/model props to its Composer', () => {
  it('renders the picker through EmptyState', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    render(
      <EmptyState
        greetingName="Jon"
        onSend={() => {}}
        effort="fast"
        onEffortChange={() => {}}
        modelOverride={null}
        onModelOverrideChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Response effort' })).toBeTruthy();
    // The forwarded effort='fast' is reflected as the checked radio.
    const fast = screen.getByRole('radio', { name: /Fast effort/ });
    expect(fast.getAttribute('aria-checked')).toBe('true');
  });
});

describe('ChatView forwards effort/model props to its Composer', () => {
  it('renders the picker through ChatView', () => {
    setFeatureEnabled('ENABLE_MODEL_EFFORT_PICKER', true);
    render(
      <ChatView
        messages={[]}
        onSend={() => {}}
        effort="thorough"
        onEffortChange={() => {}}
        modelOverride={null}
        onModelOverrideChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Response effort' })).toBeTruthy();
    const thorough = screen.getByRole('radio', { name: /Thorough effort/ });
    expect(thorough.getAttribute('aria-checked')).toBe('true');
  });
});
