/**
 * Existing project/chat and Vault upload contract. An extension in a picker or
 * receiver admits a candidate, NOT trusted bytes, successful extraction, a
 * validated dataset, filing, or regulatory readiness. The server still owns
 * name/MIME binding, byte checks, malware scanning, tenancy, and persistence.
 */
export interface DocumentIntakeFormat {
  extension: string;
  textExtraction: 'pdf' | 'docx' | 'xlsx' | 'utf8' | 'image-ocr' | 'none';
  /** A signature/byte-shape check exists for this format's declared MIME. */
  byteCheckSupported: boolean;
  chat: boolean;
  vault: boolean;
  limitation?: string;
}

export const DOCUMENT_INTAKE_FORMATS: readonly DocumentIntakeFormat[] = [
  { extension: '.pdf', textExtraction: 'pdf', byteCheckSupported: true, chat: true, vault: true },
  { extension: '.docx', textExtraction: 'docx', byteCheckSupported: true, chat: true, vault: true },
  { extension: '.xlsx', textExtraction: 'xlsx', byteCheckSupported: true, chat: true, vault: true, limitation: 'Workbook text extraction, not a mapped or validated scientific dataset.' },
  ...['.txt', '.md', '.csv', '.tsv', '.json', '.xml'].map(extension => ({
    extension, textExtraction: 'utf8' as const, byteCheckSupported: true, chat: true, vault: true,
    limitation: 'Raw UTF-8 text only; no schema, units, subject mapping, or dataset validation.',
  })),
  ...['.png', '.jpg', '.jpeg', '.gif'].map(extension => ({
    extension, textExtraction: 'image-ocr' as const, byteCheckSupported: true, chat: true, vault: true,
    limitation: 'OCR requires the configured engine/languages; accuracy and readability are not guaranteed.',
  })),
  { extension: '.doc', textExtraction: 'none', byteCheckSupported: true, chat: true, vault: true, limitation: 'Legacy admission retained; no canonical DOC text parser.' },
  { extension: '.xls', textExtraction: 'none', byteCheckSupported: true, chat: true, vault: true, limitation: 'Existing landing picker and Vault legacy admission retained; no canonical XLS text parser.' },
  { extension: '.rtf', textExtraction: 'utf8', byteCheckSupported: true, chat: false, vault: true, limitation: 'Legacy admission retained; raw markup text, not an RTF document parser.' },
  { extension: '.webp', textExtraction: 'image-ocr', byteCheckSupported: false, chat: true, vault: false, limitation: 'Existing chat declaration retained; current byte verification refuses WebP MIME, so not an end-to-end supported upload.' },
];

export const CHAT_UPLOAD_EXTENSIONS = DOCUMENT_INTAKE_FORMATS.filter(format => format.chat).map(format => format.extension);
export const VAULT_UPLOAD_EXTENSIONS = DOCUMENT_INTAKE_FORMATS.filter(format => format.vault).map(format => format.extension);
export const CHAT_UPLOAD_ACCEPT = CHAT_UPLOAD_EXTENSIONS.join(',');
export const VAULT_UPLOAD_ACCEPT = VAULT_UPLOAD_EXTENSIONS.join(',');
export const CHAT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const VAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** The shared source-text formats; existing non-intake extractor fallbacks remain separate. */
export const RAW_TEXT_SOURCE_EXTENSIONS = DOCUMENT_INTAKE_FORMATS
  .filter(format => format.textExtraction === 'utf8' && format.chat)
  .map(format => format.extension);
