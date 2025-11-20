import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileContextProvider, FileContext } from '../contexts/FileContext';

// Test component that uses FileContext
const TestComponent = () => {
  const { selectedFiles, setSelectedFiles } = React.useContext(FileContext);

  const addFile = () => {
    setSelectedFiles([...selectedFiles, { id: 'test-file-1', name: 'Test File 1', type: 'pdf' }]);
  };

  const removeFile = () => {
    setSelectedFiles(selectedFiles.filter(file => file.id !== 'test-file-1'));
  };

  return (
    <div>
      <div data-testid="file-count">{selectedFiles.length}</div>
      <button data-testid="add-file" onClick={addFile}>
        Add File
      </button>
      <button data-testid="remove-file" onClick={removeFile}>
        Remove File
      </button>
      <ul>
        {selectedFiles.map(file => (
          <li key={file.id} data-testid={`file-item-${file.id}`}>
            {file.name} ({file.type})
          </li>
        ))}
      </ul>
    </div>
  );
};

describe('FileContext', () => {
  test('initializes with empty selected files array', () => {
    render(
      <FileContextProvider>
        <TestComponent />
      </FileContextProvider>
    );

    const fileCount = screen.getByTestId('file-count');
    expect(fileCount.textContent).toBe('0');
  });

  test('adds a file to selected files', () => {
    render(
      <FileContextProvider>
        <TestComponent />
      </FileContextProvider>
    );

    const addButton = screen.getByTestId('add-file');
    fireEvent.click(addButton);

    const fileCount = screen.getByTestId('file-count');
    expect(fileCount.textContent).toBe('1');

    const fileItem = screen.getByTestId('file-item-test-file-1');
    expect(fileItem).toBeInTheDocument();
    expect(fileItem.textContent).toBe('Test File 1 (pdf)');
  });

  test('removes a file from selected files', () => {
    render(
      <FileContextProvider>
        <TestComponent />
      </FileContextProvider>
    );

    // Add a file first
    const addButton = screen.getByTestId('add-file');
    fireEvent.click(addButton);

    // Verify file was added
    let fileCount = screen.getByTestId('file-count');
    expect(fileCount.textContent).toBe('1');

    // Remove the file
    const removeButton = screen.getByTestId('remove-file');
    fireEvent.click(removeButton);

    // Verify file was removed
    fileCount = screen.getByTestId('file-count');
    expect(fileCount.textContent).toBe('0');

    // File item should not be in the document anymore
    expect(screen.queryByTestId('file-item-test-file-1')).not.toBeInTheDocument();
  });
});
