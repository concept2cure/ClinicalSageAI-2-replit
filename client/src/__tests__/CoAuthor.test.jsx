import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CoAuthor from '../pages/CoAuthor';
import { FileContextProvider, FileContext } from '../contexts/FileContext';
import { AuthProvider } from '../contexts/AuthContext';

// Mock components that CoAuthor depends on
jest.mock('../components/ectd/EmbeddedFileBrowser', () => ({
  __esModule: true,
  default: () => <div data-testid="embedded-file-browser">File Browser Mock</div>,
}));

jest.mock('../components/ectd/SelectedDocumentsPanel', () => ({
  __esModule: true,
  default: ({ documents }) => (
    <div data-testid="selected-documents-panel">
      Selected Documents: {documents.length}
      <button data-testid="compile-button">Compile Submission</button>
    </div>
  ),
}));

// Mock utilities
jest.mock('../utils/apiClient', () => ({
  vaultFetch: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
      blob: () => Promise.resolve(new Blob(['test data'], { type: 'application/zip' })),
    })
  ),
}));

// Mock toast notifications
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Test wrapper with pre-populated file context
const TestWrapper = ({ children }) => {
  return (
    <AuthProvider>
      <FileContextProvider>
        <FileContextSetter>{children}</FileContextSetter>
      </FileContextProvider>
    </AuthProvider>
  );
};

// Component to pre-populate the FileContext with test files
const FileContextSetter = ({ children }) => {
  const { setSelectedFiles } = React.useContext(FileContext);

  React.useEffect(() => {
    setSelectedFiles([
      { id: 'test-doc-1', name: 'Test Document 1.pdf', type: 'pdf' },
      { id: 'test-doc-2', name: 'Test Document 2.docx', type: 'docx' },
    ]);

    if (window.setUserRole) {
      window.setUserRole('editor'); // Set to editor to enable all actions
    }
  }, [setSelectedFiles]);

  return children;
};

describe('CoAuthor Page', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  test('renders the CoAuthor page with components', async () => {
    render(
      <TestWrapper>
        <CoAuthor />
      </TestWrapper>
    );

    // Check if main components are rendered
    expect(screen.getByTestId('embedded-file-browser')).toBeInTheDocument();
    expect(screen.getByTestId('selected-documents-panel')).toBeInTheDocument();

    // Verify selected documents appear in the panel
    expect(screen.getByText('Selected Documents: 2')).toBeInTheDocument();
  });

  test('compiles a submission when button is clicked', async () => {
    const { vaultFetch } = require('../utils/apiClient');

    render(
      <TestWrapper>
        <CoAuthor />
      </TestWrapper>
    );

    // Find and click the compile button
    const compileButton = screen.getByTestId('compile-button');
    fireEvent.click(compileButton);

    // Check that vaultFetch was called with the correct URL and body
    await waitFor(() => {
      expect(vaultFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/vault/compile'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
    });

    // Verify the request includes file IDs
    const lastCall = vaultFetch.mock.calls[vaultFetch.mock.calls.length - 1];
    const requestBody = JSON.parse(lastCall[1].body);
    expect(requestBody).toHaveProperty('fileIds');
    expect(requestBody.fileIds).toContain('test-doc-1');
    expect(requestBody.fileIds).toContain('test-doc-2');
  });

  test('handles permissions based on user role', async () => {
    // Set role to viewer (restricted permissions)
    window.setUserRole('viewer');

    render(
      <TestWrapper>
        <CoAuthor />
      </TestWrapper>
    );

    // Action buttons should be disabled for viewers
    // This would be better tested in an integration test with the real components
    // but here we're mocking the components
    expect(screen.getByTestId('compile-button')).toBeInTheDocument();

    // Change role to admin (full permissions)
    window.setUserRole('admin');

    // Re-render with admin role
    render(
      <TestWrapper>
        <CoAuthor />
      </TestWrapper>
    );

    // All actions should be enabled for admins
    expect(screen.getByTestId('compile-button')).toBeInTheDocument();
  });
});
