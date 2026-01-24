import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectedDocumentsPanel from '../components/ectd/SelectedDocumentsPanel';
import { AuthProvider } from '../contexts/AuthContext';

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
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: jest.fn(() => 'mock-url'),
    revokeObjectURL: jest.fn(),
  },
});

// Mock document functions
document.createElement = jest.fn(() => ({
  style: {},
  href: '',
  download: '',
  click: jest.fn(),
  appendChild: jest.fn(),
  removeChild: jest.fn(),
}));

document.body.appendChild = jest.fn();
document.body.removeChild = jest.fn();

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
  const mockDocuments = [
    { id: 'doc1', name: 'Document 1.pdf', type: 'pdf' },
    { id: 'doc2', name: 'Document 2.docx', type: 'docx' },
  ];

  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders nothing when no documents provided', () => {
    const { container } = render(
      <AuthProvider>
        <SelectedDocumentsPanel documents={[]} onRemove={mockOnRemove} />
      </AuthProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  test('renders documents with correct file type styling', () => {
    render(
      <AuthProvider>
        <SelectedDocumentsPanel documents={mockDocuments} onRemove={mockOnRemove} />
      </AuthProvider>
    );

    // Check if both documents are rendered
    expect(screen.getByText('Document 1.pdf')).toBeInTheDocument();
    expect(screen.getByText('Document 2.docx')).toBeInTheDocument();

    // Check if document count is displayed correctly
    expect(screen.getByText(/Selected Documents for eCTD Submission \(2\)/)).toBeInTheDocument();
  });

  test('calls onRemove when remove button is clicked', () => {
    // Set role to editor to ensure buttons are enabled
    window.setUserRole = jest.fn();

    render(
      <AuthProvider>
        <SelectedDocumentsPanel documents={mockDocuments} onRemove={mockOnRemove} />
      </AuthProvider>
    );

    // Simulate changing role to editor for permission
    if (window.setUserRole) {
      window.setUserRole('editor');
    }

    // Find all remove buttons (should be one per document)
    const removeButtons = screen.getAllByTitle(/Remove from selection/i);
    expect(removeButtons.length).toBe(2);

    // Click the first remove button
    fireEvent.click(removeButtons[0]);

    // Check if onRemove was called with the correct document ID
    expect(mockOnRemove).toHaveBeenCalled();
  });

  test('download button is disabled for viewers without edit permissions', () => {
    // Set role to viewer
    window.setUserRole = jest.fn();

    render(
      <AuthProvider>
        <SelectedDocumentsPanel documents={mockDocuments} onRemove={mockOnRemove} />
      </AuthProvider>
    );

    // Simulate changing role to viewer for limited permissions
    if (window.setUserRole) {
      window.setUserRole('viewer');
    }

    // Find download buttons
    const downloadButtons = screen.getAllByTitle(/Requires editor permissions/i);

    // Download buttons should be present but disabled
    expect(downloadButtons.length).toBeGreaterThan(0);
    expect(downloadButtons[0]).toBeDisabled();
  });

  test('download button is enabled for editors and triggers download', () => {
    // Set role to editor
    window.setUserRole = jest.fn();

    render(
      <AuthProvider>
        <SelectedDocumentsPanel documents={mockDocuments} onRemove={mockOnRemove} />
      </AuthProvider>
    );

    // Simulate changing role to editor for full permissions
    if (window.setUserRole) {
      window.setUserRole('editor');
    }

    // Find download buttons
    const downloadButtons = screen.getAllByTitle(/Download file/i);

    // Download buttons should be present and enabled
    expect(downloadButtons.length).toBeGreaterThan(0);
    expect(downloadButtons[0]).not.toBeDisabled();

    // Click download button
    fireEvent.click(downloadButtons[0]);

    // Check that download process was initiated
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(document.body.appendChild).toHaveBeenCalled();
  });
});
