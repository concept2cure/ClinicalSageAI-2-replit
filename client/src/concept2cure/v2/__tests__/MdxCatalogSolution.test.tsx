// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MdxCatalogSolution } from '../surfaces/MdxCatalogSolution';

afterEach(cleanup);

describe('MDX solution entry', () => {
  it('opens Projects and keeps its feature access list expandable', () => {
    const onOpenProjects = vi.fn();
    render(<MdxCatalogSolution onOpenProjects={onOpenProjects} features={[
      { id: 'device-510k', label: '510(k)', description: 'Submission workflow', access: <span>Included</span> },
      { id: 'device-cer', label: 'Clinical evaluation', description: 'Clinical evidence workflow', access: <span>Professional</span> },
    ]} />);
    expect(screen.getAllByTestId('mdx-catalog-solution')).toHaveLength(1);
    const summary = screen.getByText('Feature access (2)');
    expect(summary.closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
    expect(onOpenProjects).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Open 510(k)' })).toBeNull();
  });

  it('does not invent a solution when no MDX features were returned', () => {
    render(<MdxCatalogSolution features={[]} onOpenProjects={vi.fn()} />);
    expect(screen.queryByTestId('mdx-catalog-solution')).toBeNull();
  });
});
