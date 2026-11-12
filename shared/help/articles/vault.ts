import type { HelpArticle } from '../types';

/** Vault. Written from the screens' code on 2026-11-12. */
export const VAULT_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'browse-the-vault',
    title: 'Browse a project’s Vault',
    collection: 'vault',
    summary: 'Each project has its own Vault: a tree of folders, the documents in the open folder, and the record of the one you pick.',
    keywords: ['vault', 'folders', 'structure', 'library', 'document record', 'filing cabinet', 'dossier', 'binder', 'unfiled', 'new folder'],
    surfaces: ['vault'],
    related: ['add-files-to-the-vault', 'search-the-vault', 'vault-versions', 'what-the-vault-controls'],
    checked: '2026-11-12',
    body: `Open **Vault** from the left sidebar, or from a project's Evidence step with **Add or find files in Vault**. A Vault belongs to a project. With no project open, the page asks you to **Choose a project's Vault** and lists your projects.

**The views.** The tabs under the title are views of the same Vault: **Library**, **Data catalog**, **Uploads**, **Required documents**, **Governed artifacts** and **Seals & fixity**. The Library comes first.

**The Library has three parts**

- **The structure**, on the left: the project's folders. On a narrow screen, select **Structure** to open it.
- **The documents** in the open folder. Each row shows the title, its filing status, its type, version, review stage, owner and when it was updated.
- **The record** of the document you select: its status and version at the top, its actions, then sections you can open, among them **Dossier filing**, **Versions**, **File** (size and SHA-256), **Review annotations**, **Related documents** and **History**.

**Folders.** Where the filing has an outline, the folders come from it, and the page names the outline and its version. You can add your own:

1. Open the folder the new one belongs in.
2. Select **New folder**, give its **Name** and a **Reason** (at least 8 characters), and select **Make folder**.

A folder you made can be renamed, moved or removed with **Rename**, **Move** and **Remove**, each with a reason. Only an empty folder is removed, and its name and place stay in the audit trail.

**Filing status.** A document reads **Filed**, **Auto-filed · confirm** or **Unfiled**. Under **Dossier filing** you can **Confirm filing** for a suggested folder, choose another under **Move to…**, or **Unfile** it.

If your role can read the Vault but not change it, the page says **View only**, and the actions that change a record are not offered.`,
  },
  {
    slug: 'add-files-to-the-vault',
    title: 'Add files to the Vault',
    collection: 'vault',
    summary: 'Add files or a whole folder, say what each file is, and upload; each file is recorded as a version in the folder you chose.',
    keywords: ['upload', 'add files', 'upload a folder', 'drag and drop', 'import', 'document type', 'classification', 'bulk upload'],
    surfaces: ['vault'],
    related: ['browse-the-vault', 'vault-versions', 'search-the-vault'],
    checked: '2026-11-12',
    body: `Files are added to one project's Vault, so open the project's Vault first.

1. Select **Add files**, or **Upload a folder** to choose a folder on your computer. You can also drop files or a folder anywhere on the page.
2. The files are listed under **Files to upload**. Nothing is recorded yet.
3. For each file, check:
   - **Title**;
   - **Document type**. **Type for files added next** sets the type new rows start with; each row can change its own;
   - **Classification**. Left blank, it is Confidential;
   - **Folder**. A folder chosen here is recorded as filed by you. With none chosen, the Vault suggests a folder for you to confirm, or leaves the file Unfiled.
4. Remove any file you do not want from the list.
5. Select **Upload**. The button says how many files it will send.

Each row then reports its own outcome: recorded, with its version and where it was filed, or not recorded, with the reason. If the connection dropped and the outcome is not known, the row says so; reload the Vault and check before trying again. The button then reads **Try again for** the files that were not recorded.

One drop or selection reads up to 500 files. Add the rest in another.

**Other ways in**

- **Ask AnA to import** describes an import to AnA instead, for example a bulk import from another system.
- Files attached in a conversation with AnA or added on the project's Evidence step pass through the data room. Files uploaded on this page go straight to the Vault's folders and are listed on the **Uploads** view under **Uploaded files**.

Adding files needs a role that can write to the Vault. A view-only role does not see these controls.`,
  },
  {
    slug: 'vault-versions',
    title: 'Work with versions of a Vault document',
    collection: 'vault',
    summary: 'Upload a new version, read or download any version, compare an earlier one with the current, or restore it as the next version.',
    keywords: ['version', 'new version', 'history', 'compare', 'restore', 'earlier version', 'superseded', 'sha-256', 'check in', 'signed history'],
    surfaces: ['vault'],
    related: ['browse-the-vault', 'what-the-vault-controls', 'download-from-the-vault'],
    checked: '2026-11-12',
    body: `Select a document in the Vault and open **Versions** in its record. Every version is listed, marked current or earlier, with its date, who uploaded it, its size, its SHA-256 and its review stage. Where a version is placed in a submission or cited by a document section, the row says so.

**Add a new version**

1. Select **Upload new version** and choose the file.
2. The new file becomes the current version. Earlier versions stay in the list.

If the current version is placed in a sequence that has not been transmitted, a warning names the sequences first. Once a new version is added, the earlier one can no longer be transmitted from them. A draft sequence can take the new version after it is approved; a frozen or dispatched sequence cannot be changed.

After a new version, the current row lists any document sections that still cite an earlier version, each opening the editor at that section.

**Read or download a version.** **View** opens a PDF in the page. A Word file is shown with **View as PDF**, a rendition made for reading; the version in the Vault is still the Word file. **Download** saves that version's file.

**Compare.** On an earlier version, select **Compare with** the current version. The comparison says whether the bytes are the same and which recorded details and lines changed.

**Restore an earlier version**

1. On the earlier version, select **Restore … as a new version**.
2. Give the reason (at least 8 characters) and confirm.

Its file becomes the next version. Nothing is overwritten, the restored version has not been reviewed yet, and your reason is recorded in its history.

**Export signed history** downloads the audit records for the document's versions.

In the Library, tick **Earlier versions** to include earlier versions in the list and in searches.`,
  },
  {
    slug: 'search-the-vault',
    title: 'Search the Vault, filter it, and save a view',
    collection: 'vault',
    summary: 'Search titles and document text, narrow with filters, and save the combination as a view for yourself or the organisation.',
    keywords: ['search', 'find', 'filter', 'saved view', 'facets', 'ctd section', 'all my projects', 'classification', 'evidence kind'],
    surfaces: ['vault'],
    related: ['browse-the-vault', 'vault-versions', 'download-from-the-vault'],
    checked: '2026-11-12',
    body: `**Search.** In the Library, type in **Search titles and document text**. The list changes to the matching documents and says what is narrowing it. A document still being read is not searched yet, and the page says how many are. If the search could not be completed, the page says so; that is not a result of zero matches.

**Filters.** Under the search box:

- **Type**, the document type;
- **Filing**: Unfiled, Auto-filed · confirm or Filed;
- **Classification**;
- **Evidence kind**;
- **Review**: Not sent for review, In review, Approved, Superseded or Withdrawn;
- **CTD section**, for filings numbered that way. Enter a code such as 3.2.P.

Where the counts have been read, each choice shows how many documents it selects. **Clear filters** removes them all.

**Scope.** Tick **Earlier versions** to include versions that are no longer current. Tick **All my projects** to search every project you can open, not only this one. A folder filter belongs to one project, so remove it before searching all projects.

**Saved views**

1. Type a search or choose a filter.
2. Select **Saved views**, then **Save current search…**.
3. Give the view a **Name** and choose **Only me** or **Everyone in the organisation**. A view-only role can save views for itself only.
4. Select **Save**.

To use one, choose it under **Saved view** and select **Apply**. On a view you may change, **Update view** saves the current search over it, **Rename** and **Delete** do what they say, and **Share with organisation** or **Make personal** changes who sees it.

You can also ask AnA from the top of the page, for example **What is missing for this filing?**`,
  },
  {
    slug: 'download-from-the-vault',
    title: 'Read, download and export from the Vault',
    collection: 'vault',
    summary: 'View a file in the page, download it, export a whole folder as a verified zip, or download a seal’s closing archive.',
    keywords: ['download', 'export', 'zip', 'folder export', 'view', 'pdf', 'docx', 'archive', 'closing archive', 'audit trail'],
    surfaces: ['vault'],
    related: ['vault-versions', 'what-the-vault-controls', 'search-the-vault'],
    checked: '2026-11-12',
    body: `**One document.** Select it in the Library. The actions at the top of its record depend on what it is:

- An uploaded file: **View** opens it in the page, a PDF as itself and a Word file as a PDF rendition. **Download** saves the current version's file. To get an earlier version, open **Versions** and use **Download** on that row.
- A governed artifact (a document built here): **Download DOCX** saves the governed export of the current version. The download is recorded, and it is refused unless that version has a recorded human review or signature. A refusal says why.
- An authored record with no file shows **No file to download**. Export it from the screen that owns it.

If a file's original was removed under a recorded retention decision, **Download** is unavailable and the record says the original file is unavailable.

**A whole folder**

1. Open the folder in the Library.
2. Select **Export** followed by the folder's name.

You get a zip of the current version of each document in the folder, verified, with an index and their audit trail. The button appears only for a filing folder that holds uploaded documents. If a document's original file was withdrawn, the export says so, and the index still lists it.

**A sealed Vault.** On the **Seals & fixity** view, a seal lists each document as it was when sealed: its version, review stage and content hash. **Verify** checks the seal against what is stored now. **Download closing archive** saves the sealed files, the record as signed, an index, the checksums and the audit trail in one zip.

**The audit history of a document.** In **Versions**, **Export signed history** downloads the audit records for its versions.`,
  },
  {
    slug: 'what-the-vault-controls',
    title: 'What the Vault controls',
    collection: 'vault',
    summary: 'Every file is a version with a checksum, a filing status and a review stage; changes take a reason and approval takes a signature.',
    keywords: ['controlled', 'governed', 'review', 'approve', 'send for review', 'signature', 'part 11', 'audit trail', 'place into filing', 'seal', 'view only', 'separation of duties'],
    surfaces: ['vault', 'submission-center'],
    related: ['vault-versions', 'browse-the-vault', 'build-an-ectd-sequence'],
    checked: '2026-11-12',
    body: `The Vault is the project's controlled document store. This is what it holds for each document, and what it asks of you.

**Every file is a version.** A file is recorded with its size and SHA-256. A new file for the same document is a new version; earlier versions are kept and can be read, compared and restored. See *Work with versions of a Vault document*.

**Two separate statuses**

- **Filing**: where the document sits in the project's folders. Unfiled, Auto-filed · confirm (a suggestion waiting for you) or Filed. Who filed it is shown.
- **Review**: Not sent for review, In review, Approved, Superseded or Withdrawn. Review and approval are apart from filing.

**Review and approval**

1. On the current version, select **Send for review**.
2. Name the **Reviewers** and the **Approvers**, set the due dates, and give the **Reason for sending**.
3. Each reviewer signs with **Sign review**. Once every reviewer has, each approver signs with **Approve**. The last signature approves the version.

Signing needs a role with signing authority. The person who uploaded a version or sent it for review does not review or approve it, and the person who signed the review does not approve it. A route can be withdrawn or the version returned for revision, each with a reason.

**Reasons.** Making, renaming, moving or removing a folder, restoring a version and sending for review each ask for a reason of at least 8 characters. It is recorded in the audit trail with who and when. A document's **History** shows what was done to it.

**Into a submission.** **Place into filing…** on an uploaded file's record places it in an eCTD sequence: choose the **Target submission** and **Sequence**, the section and the **Lifecycle operation**, and give the **Reason for this placement**. The leaf points at the Vault copy, so what is assembled is what is stored. Only approved documents are transmitted.

**View only.** A role that can read but not write sees the records, and is not offered the actions that change them.`,
  },
];
