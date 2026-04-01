import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import * as framerMotion from 'framer-motion';
import FirstRunExperience from '../FirstRunExperience';
import { apiRequest } from '@/lib/queryClient';

jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(),
}));

beforeEach(() => {
  jest.spyOn(framerMotion, 'useReducedMotion').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FirstRunExperience', () => {
  it('shows project creation errors without crashing', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<FirstRunExperience onComplete={jest.fn()} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Pharma & Biotech/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText(/Quick setup/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Regulatory Writer/i }));
    fireEvent.click(screen.getByRole('button', { name: 'IND' }));
    fireEvent.click(screen.getByRole('button', { name: /FDA \(US\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText(/Create your first project/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Project name/i), {
      target: { value: 'Alpha IND Project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText(/Project creation failed/i)).toBeInTheDocument();
    });
  });
});
