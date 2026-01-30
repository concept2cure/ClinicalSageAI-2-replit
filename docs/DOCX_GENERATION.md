# DOCX Generation (MVP)

Purpose: generate a .docx file from an AssemblyLine document and optionally attach it to project knowledge so it can be opened in the regulatory editor.

API

- POST /api/test-assembly/export-docx
  - Body: { docId: string, projectId?: string, filename?: string }
  - Behavior:
    - Returns generated `.docx` as an attachment when `projectId` is not provided.
    - If `projectId` provided, saves the generated file to `generated_documents/` and returns file metadata so the caller can attach it to the project (MVP: lightweight attach response).

Notes

- Implementation uses the `docx` npm library to render a heading + paragraphs. For production templates, we will support template DOCX files and docxtemplater-style merges.
- We record audit metadata in AssemblyLine and keep traceability in generated filenames.
- Next steps: import generated file directly into the project knowledge (update project settings fully), support DOCX templates, and add validation against IND formatting rules.
