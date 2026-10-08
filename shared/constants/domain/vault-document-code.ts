/**
 * The document code a file is admitted under: the file name as its uploader
 * named it, extension included.
 *
 * This is the one rule for every route that puts a file into the Vault. The
 * Vault upload sends it (client/src/concept2cure/v2/useVaultUpload.ts), and the
 * data room's "File into Vault" derives it the same way
 * (server/services/vault/vault-file-upload-to-vault.ts). The data room used to
 * strip the extension and rewrite the characters, so one file filed from each
 * route got two codes: a parallel document, and a revised file refused at a
 * code the Vault screen did not show (QA-2026-10-08).
 *
 * The extension is kept because it is part of the name the person recognises,
 * and because Protocol.pdf and Protocol.docx are not one document's versions.
 * The fallback is used only when there is no name at all.
 */
export function vaultDocumentCodeForFile(fileName: string, fallback: string): string {
  return fileName.trim() ? fileName : fallback;
}
