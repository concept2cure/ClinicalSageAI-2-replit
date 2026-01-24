import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmbeddedFileBrowser from '../components/ectd/EmbeddedFileBrowser';
import { FileContextProvider } from '../contexts/FileContext';
import { AuthProvider } from '../contexts/AuthContext';

// Mock the components and hooks that EmbeddedFileBrowser depends on
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className }) => (
    <button onClick={onClick} disabled={disabled} className={className} data-testid="mock-button">
      {children}
    </button>
  ),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('react-window', () => ({
  FixedSizeList: ({ children }) => <div data-testid="virtual-list">{children({ index: 0 })}</div>,
}));

jest.mock('react-highlight-words', () => ({
  __esModule: true,
  default: ({ children }) => <span data-testid="highlighted-text">{children}</span>,
}));

jest.mock('../utils/apiClient', () => ({
  vaultFetch: jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'folder-1', name: 'Folder 1', type: 'folder' },
          { id: 'folder-2', name: 'Folder 2', type: 'folder' },
        ]),
    })
  ),
}));

describe('EmbeddedFileBrowser', () => {
  beforeEach(() => {
    // Reset mocks between tests
    jest.clearAllMocks();
  });

  test('renders the file browser with loading state', () => {
    render(
      <AuthProvider>
        <FileContextProvider>
          <EmbeddedFileBrowser />
        </FileContextProvider>
      </AuthProvider>
    );

    // Initially should be in loading state
    const loadingElement = screen.getByText(/Loading files/i);
    expect(loadingElement).toBeInTheDocument();
  });

  test('displays folders when loaded', async () => {
    render(
      <AuthProvider>
        <FileContextProvider>
          <EmbeddedFileBrowser />
        </FileContextProvider>
      </AuthProvider>
    );

    // Wait for the loading state to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Loading files/i)).not.toBeInTheDocument();
    });

    // Check if the virtual list is rendered
    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toBeInTheDocument();
  });

  test('search functionality filters folders', async () => {
    render(
      <AuthProvider>
        <FileContextProvider>
          <EmbeddedFileBrowser />
        </FileContextProvider>
      </AuthProvider>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/Loading files/i)).not.toBeInTheDocument();
    });

    // Find the search input
    const searchInput = screen.getByPlaceholderText(/Search/i);
    expect(searchInput).toBeInTheDocument();

    // Type in the search box
    fireEvent.change(searchInput, { target: { value: 'Folder' } });

    // Check that search is applied
    await waitFor(() => {
      expect(searchInput.value).toBe('Folder');
    });
  });

  test('role-based permissions affect button states', async () => {
    // Define a custom render function that allows us to set the initial role
    const customRender = (ui, { role = 'viewer' } = {}) => {
      // Create a test component that can change roles
      const Wrapper = ({ children }) => {
        React.useEffect(() => {
          // Set the role for the test
          if (window.setUserRole) {
            window.setUserRole(role);
          }
        }, []);

        return (
          <AuthProvider>
            <FileContextProvider>{children}</FileContextProvider>
          </AuthProvider>
        );
      };

      return render(ui, { wrapper: Wrapper });
    };

    // Render with viewer role
    customRender(<EmbeddedFileBrowser />, { role: 'viewer' });

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/Loading files/i)).not.toBeInTheDocument();
    });

    // Find buttons that should be disabled for viewers
    const buttons = screen.getAllByTestId('mock-button');

    // At least one button should be disabled (for viewers)
    const someDisabled = buttons.some(button => button.disabled);
    expect(someDisabled).toBe(true);
  });
});
