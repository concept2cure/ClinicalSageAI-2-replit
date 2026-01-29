import React, { createContext, useContext, useState } from 'react';

const FileContext = createContext();

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
};

export const FileProvider = ({ children }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [validationResult, setValidationResult] = useState(null);

  const selectFile = fileId => {
    setSelectedFiles(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  const removeFile = fileId => {
    setSelectedFiles(prev => prev.filter(id => id !== fileId));
  };

  const clearSelection = () => {
    setSelectedFiles([]);
  };

  const value = {
    selectedFiles,
    setSelectedFiles,
    validationResult,
    setValidationResult,
    selectFile,
    removeFile,
    clearSelection,
  };

  return <FileContext.Provider value={value}>{children}</FileContext.Provider>;
};

export { FileContext };
export const FileContextProvider = FileProvider;
