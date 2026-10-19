// @vitest-environment jsdom
/**
 * "Add a market" says before the form who may add one (Part 11 review,
 * 2026-10-15). The add needs the project's lead or an organization manager; a
 * member who is neither filled in the form and met a 403. The project read now
 * carries the same decision (canChange), and the door says it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectMarkets } from '../surfaces/ProjectMarkets';

const markets = { list: { rows: [], loading: false, empty: true }, notOffered: 0, markets: [], retryList: vi.fn(), retryMarket: vi.fn() } as never;
const props = (canChange?: boolean) => ({ markets, onNav: vi.fn(), available: () => true, ectdFiling: true, canChange });

afterEach(cleanup);

describe('Add a market and who may add one', () => {
  it('is offered to someone who may change the project', () => {
    render(<ProjectMarkets {...props(true)} />);
    expect((screen.getByRole('button', { name: /Add a market/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('is disabled for someone who may not, and says who may', () => {
    render(<ProjectMarkets {...props(false)} />);
    const add = screen.getByRole('button', { name: /Add a market/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent)
      .toBe("Only this project's lead or an organization manager can add a market.");
  });

  it('a project read that does not say is not taken as a refusal', () => {
    render(<ProjectMarkets {...props(undefined)} />);
    expect((screen.getByRole('button', { name: /Add a market/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
