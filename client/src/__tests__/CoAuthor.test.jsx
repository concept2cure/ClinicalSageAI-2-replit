import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import CoAuthor from '../pages/CoAuthor';
import { FileContextProvider, FileContext } from '../contexts/FileContext';
import { AuthProvider } from '../portal-v2/services/authService';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    setFont: jest.fn(),
    text: jest.fn(),
    save: jest.fn(),
  })),
}));

jest.mock('jspdf-autotable', () => ({}));

jest.mock('react-dnd', () => ({
  __esModule: true,
  DndProvider: ({ children }) => <div data-testid="dnd-provider">{children}</div>,
  useDrag: () => [{}, jest.fn()],
  useDrop: () => [{}, jest.fn()],
}));

jest.mock('react-dnd-html5-backend', () => ({
  __esModule: true,
  HTML5Backend: {},
}));

// Mock components that CoAuthor depends on
jest.mock('../components/ectd/EmbeddedFileBrowser', () => ({
  __esModule: true,
  default: () => <div data-testid="embedded-file-browser">File Browser Mock</div>,
}));

jest.mock('../components/ectd/SelectedDocumentsPanel', () => ({
  __esModule: true,
  default: ({ selectedFiles }) => (
    <div data-testid="selected-documents-panel">
      Selected Documents: {selectedFiles.length}
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

jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(async (url) => {
    if (url.includes('/versions')) {
      return { versions: [] };
    }
    if (url.includes('/validate/history')) {
      return { history: [] };
    }
    if (url.includes('/validate')) {
      return { valid: true };
    }
    if (url.includes('/ind-submissions/active')) {
      return { submissions: [] };
    }
    if (url.includes('/documents')) {
      return { documents: [] };
    }
    return {};
  }),
  default: {},
}));

// Mock toast notifications
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Test wrapper with pre-populated file context
const TestWrapper = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async () => ({}),
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FileContextProvider>
          <FileContextSetter>{children}</FileContextSetter>
        </FileContextProvider>
      </AuthProvider>
    </QueryClientProvider>
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
    await act(async () => {
      render(
        <TestWrapper>
          <CoAuthor />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('embedded-file-browser')).toBeInTheDocument();
    });
  });

  test('renders the CoAuthor page without crashing', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <CoAuthor />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('embedded-file-browser')).toBeInTheDocument();
    });
  });
});
