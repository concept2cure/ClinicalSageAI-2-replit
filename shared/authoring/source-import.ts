/** The existing editor's exact, server-verified source working copy contract. */
export type AuthoringImportSource =
  | { kind: 'vault'; documentId: string }
  | { kind: 'data-room'; sourceId: number };

export interface AuthoringImportOrigin {
  kind: AuthoringImportSource['kind'];
  id: string;
  programId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  documentType: string | null;
  sectionCode: string | null;
  conversion: 'docx-structure' | 'extracted-text';
}

export interface AuthoringSourceImportData {
  doc: Record<string, unknown> & { id: string; title: string };
  sections: Record<string, unknown>[];
  origin: AuthoringImportOrigin;
  warnings: string[];
  reused: boolean;
}
