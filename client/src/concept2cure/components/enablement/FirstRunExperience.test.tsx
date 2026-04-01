import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirstRunExperience from './FirstRunExperience';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

describe('FirstRunExperience', () => {
  it('shows project creation errors without crashing', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<FirstRunExperience onComplete={vi.fn()} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Pharma & Biotech/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: /Regulatory Writer/i }));
    fireEvent.click(screen.getByRole('button', { name: 'IND' }));
    fireEvent.click(screen.getByRole('button', { name: /FDA \(US\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText(/Project name/i), {
      target: { value: 'Alpha IND Project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText(/Project creation failed/i)).toBeInTheDocument();
    });
  });
});
