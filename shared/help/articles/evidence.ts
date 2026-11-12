import type { HelpArticle } from '../types';

/** Evidence and the data room. Written from the Evidence step's code and checked on 2026-11-12. */
export const EVIDENCE_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'the-evidence-step',
    title: 'What the Evidence step holds',
    collection: 'evidence',
    summary: 'The data room, where the project’s sources are added and read, and Project files, the project’s Vault.',
    keywords: ['evidence', 'sources', 'data room', 'project files', 'vault', 'source documents'],
    surfaces: ['project-home', 'vault'],
    related: ['add-sources-to-the-data-room', 'find-and-open-project-files', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `Open a project and select the **Evidence** step. It holds every way a source comes into the project.

**Data room.** The sources this project's documents are written from. The line under the heading counts them and says how many are readable. Each row shows the file's kind, size and the date it was added, whether its text was read, and where it is cited. From here you add sources, search them, and hand them to AnA as the context for a draft.

**Project files.** The project's Vault, beside the page. Three buttons choose what is listed:

- **Vault**: the project's filed documents as a folder tree, with a search box.
- **Data room**: the same sources, listed as a library.
- **IND documents**: the document types of an IND, for a project that files one. A device or diagnostic project does not show it.

**Add or find files in Vault** opens the Vault itself, where files are filed, uploaded and versioned.

**When a source changes.** If a section was drafted from a source that has since changed, or from a Vault version that a later approved version replaced, the data room says so and lists the sections. Nothing is rewritten. Open each section and decide whether the newer content changes what it says.

A list that could not be read says so, with a retry. It is never shown as an empty data room.`,
  },
  {
    slug: 'add-sources-to-the-data-room',
    title: 'Add sources to the data room',
    collection: 'evidence',
    summary: 'Drop files on Add sources; each is read on upload, and the row says whether its text can ground a draft.',
    keywords: ['upload', 'add file', 'drag and drop', 'read on upload', 'ocr', 'scanned pdf', 'text not readable', 'file too large', 'zip'],
    surfaces: ['project-home'],
    related: ['the-evidence-step', 'draft-from-data-room-sources', 'find-and-open-project-files'],
    checked: '2026-11-12',
    body: `1. Open the project's **Evidence** step.
2. Under **Data room**, drop files on **Add sources**, or click it to browse.
3. Wait for each file's chip to change from "Uploading …" to its result.

PDF, Word (.docx), Excel (.xlsx), text and CSV files, images and SAS transport (.xpt) files are accepted, up to 50 MB each. A .zip is opened in your browser and each file inside is uploaded on its own.

**What "read on upload" means.** As a file arrives, its text is extracted and kept with the source, so AnA can draft from it and a citation can point back to it. The chip says what was read: "text extracted · 4,210 words", or "text extracted via OCR" for a scan. If a scan could only be read in part, the chip says how many pages were covered. "no text extracted" means the file is stored but nothing could be read from it.

**On the source's row**, the same fact stays visible: **Read**, **Read via OCR**, or **Text not readable**. A source with no readable text is still kept, but it cannot be ticked as context for AnA, because a draft "from" it would be grounded in nothing. A spreadsheet is read as text; it is not validated as a dataset.

**Refresh sources** reads the current status again. It does not retry processing.

A file attached to AnA's composer inside the project becomes the same source, not a second copy.`,
  },
  {
    slug: 'draft-from-data-room-sources',
    title: 'Search the data room and draft from chosen sources',
    collection: 'evidence',
    summary: 'Search sources by title or text, tick the ones to use, and hand them to AnA as the context for a draft.',
    keywords: ['search sources', 'pin', 'context', 'write from these sources', 'grounding', 'used in', 'citations', 'working copy'],
    surfaces: ['project-home'],
    related: ['add-sources-to-the-data-room', 'draft-a-section-with-ana', 'find-and-open-project-files'],
    checked: '2026-11-12',
    body: `**Search.** Once the data room holds a source, a search box appears above the list. It searches each source's title and its text, across the whole data room. The line under the heading gives the number of matches, and a match shows the passage that matched.

**Choose sources for AnA**

1. Tick the checkbox beside each source you want AnA to use. Only a source whose text was read can be ticked.
2. Select **Draft with N pinned sources**.
3. AnA's composer opens with those sources as the context of your next message. Say what you want drafted.

With nothing ticked, **Write from these sources** hands over the readable sources instead, the ten newest at most.

**Where a source is used.** A row says "Used in 3 accessible sections · 1 accessible document" when sections you can see cite it. If the source changed after it was cited, the row adds how many sections were written against the older content.

**Work on document** makes an editable working copy of a source in the one editor. You give a reason, and the copy is created as a draft; the source's approval and signatures are not copied. Word documents keep their supported headings, lists and tables. Other formats become extracted text, to be checked against the original.

**Open the data catalog** shows the sources across your projects in the Vault.`,
  },
  {
    slug: 'find-and-open-project-files',
    title: 'Find a project file and open a PDF',
    collection: 'evidence',
    summary: 'Browse or search the project’s Vault from the Evidence step; a PDF opens in a viewer with its SHA-256.',
    keywords: ['search files', 'open pdf', 'viewer', 'download', 'sha-256', 'hash', 'checksum', 'folder', 'project vault'],
    surfaces: ['project-home', 'vault', 'document-authoring'],
    related: ['the-evidence-step', 'draft-a-section-with-ana', 'add-sources-to-the-data-room'],
    checked: '2026-11-12',
    body: `On the project's **Evidence** step, go to **Project files** and keep **Vault** selected.

**Browse.** The project's vault is a folder tree. Each folder shows how many items it holds; an empty one says "Nothing filed here yet." Each file shows its number, type and size, and its status.

**Search.** Type in **Search titles and text…**. The results replace the tree and show how many matches there are; **More results** loads the next page. If nothing matches, the panel says so. If the search itself failed, it says that instead, with a retry.

**Open a file**

1. Select the file. Its title, the start of its SHA-256 and where it is filed appear below the list.
2. Select **Open**.
3. A PDF opens in a viewer in the same panel. The line above it gives the file's SHA-256, verified against the vault record before it was served.
4. Select **Back to files** to return to the list.

A file that is not a PDF is downloaded instead, and a message says why. Every open goes through the Vault's download route, so it is recorded.

**Work on document** makes an editable working copy of an uploaded file in the editor.

The same panel is in the document editor: open **More** and choose **Vault**. There, a selected file that is a data room source has **Cite in §…**, which cites it in the open section. Any other file has **Insert reference**, which adds its title and the start of its SHA-256 as plain text, not as a citation.

To upload, file or version documents, select **Add or find files in Vault**.`,
  },
  {
    slug: 'ind-documents-library',
    title: 'Use the IND documents library',
    collection: 'evidence',
    summary: 'For an IND project: every IND document type, with its template, its sources and a start with AnA.',
    clientTypes: ['biotech', 'pharma', 'cro'],
    keywords: ['ind', 'document types', 'ctd sections', 'module outlines', 'template', 'working copy', 'deliverables'],
    surfaces: ['project-home'],
    related: ['start-a-document', 'find-and-open-project-files', 'the-evidence-step'],
    checked: '2026-11-12',
    body: `For a project that files an IND, **Project files** on the Evidence step has a third list: **IND documents**. It holds the document types across all IND phases. A device or diagnostic project does not show it.

**Find a document type**

- Choose the list: **Pyramid deliverables**, **CTD sections** or **Module outlines**.
- Type in **Find a document type…**, or narrow by **Module** (M1 to M5) and **Phase**.
- The line above the list gives the number of entries. **More IND documents** shows the next ones; **Clear filters** starts again.

**Work from an entry.** Select an entry to expand it. It shows what the document is and, where it has a template, the number of sections, whether it is a preparation worksheet or a narrative working outline, and the template's limits.

- **Open …** opens a working document this project already holds for the entry, with its status.
- **Create from template** creates a working copy in the project; **Open working copy** then opens it in the editor. The copy is not bound to a filing.
- **Find source** searches the project's vault for the entry's title.
- **Work with AnA** asks AnA to prepare a working draft from the project's sources. For an entry that is a form or a data file, the button reads **Prepare with AnA** and AnA prepares a completion checklist; use the original form or data file.

AnA does not mark a document approved or complete. That stays with review and signature.`,
  },
];
