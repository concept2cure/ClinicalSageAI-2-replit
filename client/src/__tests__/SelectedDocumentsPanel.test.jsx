import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectedDocumentsPanel from '../components/ectd/SelectedDocumentsPanel';

// Mock the utils/apiClient module
jest.mock('../utils/apiClient', () => ({
  vaultFetch: jest.fn(() =>
    Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['mock file content'], { type: 'application/pdf' })),
    })
  ),
}));

// Mock window.URL.createObjectURL and related methods
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = jest.fn(() => 'mock-url');
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = jest.fn();
}

// Mock document functions for anchor elements only
const originalCreateElement = document.createElement.bind(document);

jest.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
  const element = originalCreateElement(tagName, options);

  if (tagName === 'a') {
    element.click = jest.fn();
  }

  return element;
});

// Mock hook
jest.mock(
  '../../hooks/use-toast',
  () => ({
    useToast: () => ({
      toast: jest.fn(),
    }),
  }),
  { virtual: true }
);

describe('SelectedDocumentsPanel', () => {
  // Sample documents for testing
  const mockSelectedFiles = ['file-m1-1', 'file-m2-1'];

  const mockOnRemoveFile = jest.fn();
  const mockOnCompile = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders nothing when no documents provided', () => {
    render(<SelectedDocumentsPanel selectedFiles={[]} />);

    expect(screen.getByText('No documents selected')).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  test('renders documents with correct file type styling', () => {
    render(
      <SelectedDocumentsPanel
        selectedFiles={mockSelectedFiles}
        onRemoveFile={mockOnRemoveFile}
        onCompile={mockOnCompile}
      />
    );

    // Check if both documents are rendered
    expect(screen.getByText('Cover Letter')).toBeInTheDocument();
    expect(screen.getByText('CTD Table of Contents')).toBeInTheDocument();

    // Check if document count is displayed correctly
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  test('calls onRemove when remove button is clicked', () => {
    render(
      <SelectedDocumentsPanel
        selectedFiles={mockSelectedFiles}
        onRemoveFile={mockOnRemoveFile}
        onCompile={mockOnCompile}
      />
    );
    // Find all remove buttons (should be one per document)
    const removeButtons = screen.getAllByLabelText('Remove document');
    expect(removeButtons.length).toBe(2);

    // Click the first remove button
    fireEvent.click(removeButtons[0]);

    // Check if onRemoveFile was called with the correct document ID
    expect(mockOnRemoveFile).toHaveBeenCalledWith('file-m1-1');
  });

  test('compile button is enabled when documents exist', () => {
    render(
      <SelectedDocumentsPanel
        selectedFiles={mockSelectedFiles}
        onRemoveFile={mockOnRemoveFile}
        onCompile={mockOnCompile}
      />
    );

    const compileButton = screen.getByRole('button', { name: /Compile eCTD Submission/i });
    expect(compileButton).toBeEnabled();

    fireEvent.click(compileButton);
    expect(mockOnCompile).toHaveBeenCalledWith(mockSelectedFiles);
  });
});
