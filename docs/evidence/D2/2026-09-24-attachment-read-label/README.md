# D2: a chat attachment nothing had read was labelled "read"

**Row:** D2 (launch catalog working honestly). This is the first thing a user
sees after giving AnA a file. **Workstream:** the AnA client-files lane.
**Date:** 2026-09-24. **Source:** this lane's audit of the upload → AnA path
(a read-only auditor; verified here before the fix).

## The defect

`POST /api/chat/upload` answers `status: 'ready'` whether or not extraction
produced any text: a scanned PDF, or an image that OCR could not read. It
reports that case as `extractionWords: 0`. `attachmentReadLabel`
(`client/src/concept2cure/hooks/useChatUpload.ts`) correctly returns `null` for
zero words. Two of the four composers then filled that `null` with the literal
`'read'`:

- `ConversationThread.tsx:1033`
- `EctdCoauthor.tsx:835`

So a file nothing had read showed as **"scan.pdf · read"**, identical to a file
that had been. `ProjectHome.tsx` and the `Shell` rendered nothing in that case,
which is silent rather than false.

## The fix

`readyAttachmentLabel(method, words)` in the hook gives the chip text for a
ready attachment: the read label (`read · 1,240 words`, `read via OCR · 87
words`) or **`no text extracted`**. All four composers use it, so the unread
case has one spelling and cannot be filled in differently again.
`attachmentReadLabel` and its null contract are unchanged.

## Evidence

| File | Result |
|---|---|
| `red/unit-attachment-chip.txt` | 2 failed, 2 passed. Rendered through the real label helpers, both composers show `scan.pdf · read` for a ready file with 0 words. The read case (`protocol.docx · read · 1,240 words`) passes, as it should. |
| `green/unit-attachment-chip.txt` | 76 passed across 10 files: the new chip test, the existing composer-attach test, the hook's tests (with two new cases for `readyAttachmentLabel`), and the Shell and ProjectHome suites. |

Typecheck: 0. ESLint is unchanged against HEAD for all five changed files.

## Found alongside, handled separately

On the numeric-workspace upload branch, the retrieval atom was written with the
upload placeholder (`[Uploaded via chat: …]`) as its content when extraction
failed. The program branch already refused to do that.
