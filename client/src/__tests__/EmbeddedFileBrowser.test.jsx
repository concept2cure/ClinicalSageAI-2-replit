import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EmbeddedFileBrowser from '../components/ectd/EmbeddedFileBrowser';

// Mock the components and hooks that EmbeddedFileBrowser depends on
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className }) => (
    <button onClick={onClick} disabled={disabled} className={className} data-testid="mock-button">
      {children}
    </button>
  ),
}));

describe('EmbeddedFileBrowser', () => {
  beforeEach(() => {
    // Reset mocks between tests
    jest.clearAllMocks();
  });

  test('renders module and file list', () => {
    render(<EmbeddedFileBrowser />);

    expect(screen.getByText(/eCTD Document Structure/i)).toBeInTheDocument();
    expect(screen.getByText(/Module 1 - Administrative Information/i)).toBeInTheDocument();
    expect(screen.getByText(/Cover Letter/i)).toBeInTheDocument();
  });

  test('collapses and expands modules', () => {
    render(<EmbeddedFileBrowser />);

    const moduleButton = screen.getByText(/Module 1 - Administrative Information/i);
    expect(screen.getByText(/Cover Letter/i)).toBeInTheDocument();

    fireEvent.click(moduleButton);
    expect(screen.queryByText(/Cover Letter/i)).not.toBeInTheDocument();

    fireEvent.click(moduleButton);
    expect(screen.getByText(/Cover Letter/i)).toBeInTheDocument();
  });

  test('calls onFileSelect when selecting a file', () => {
    const onFileSelect = jest.fn();
    render(<EmbeddedFileBrowser onFileSelect={onFileSelect} />);

    const selectButtons = screen.getAllByText('Select');
    fireEvent.click(selectButtons[0]);

    expect(onFileSelect).toHaveBeenCalledWith('file-m1-1');
  });

  test('shows selected state for selected files', () => {
    render(<EmbeddedFileBrowser selectedFiles={['file-m1-1']} />);

    expect(screen.getByText('Selected')).toBeInTheDocument();
  });
});
