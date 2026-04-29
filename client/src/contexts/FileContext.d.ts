// Sibling declaration for FileContext.jsx so .tsx callers don't trip
// TS7016. Tighten when migrated to .tsx.
import type { ComponentType, Context, ReactNode } from 'react';

export interface FileContextValue {
  selectedFiles: string[];
  setSelectedFiles: (ids: string[] | ((prev: string[]) => string[])) => void;
  validationResult: unknown;
  setValidationResult: (result: unknown) => void;
  selectFile: (fileId: string) => void;
  removeFile: (fileId: string) => void;
  clearSelection: () => void;
}

export const FileContext: Context<FileContextValue | undefined>;
export const FileProvider: ComponentType<{ children?: ReactNode }>;
export const FileContextProvider: ComponentType<{ children?: ReactNode }>;
export const useFileContext: () => FileContextValue;
