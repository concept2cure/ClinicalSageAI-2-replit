# D3: the in-browser PDF viewer renders under the served CSP, and Vault reaches it (2026-10-22)

Gap 3, work item 1 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Reach `PdfViewerPane`
from the Vault detail panel and from Versions. First prove the blob frame under
the served production CSP." The proof found a defect in one deployment topology.
After the fix, the Vault surface reaches the same viewer. This is a fix and a
convergence, not a new viewer.

## What already exists

- **The viewer.** `ProjectFilesPanel.tsx` implemented it privately:
  - `downloadVaultFile` reads the file through the audited download route.
  - `pdfViewerBlob` (`pdfBytes.ts`) admits only bytes that begin `%PDF`, typed `application/pdf`.
  - `useVaultPdfViewer` keeps a single object URL.
  - `PdfViewerPane` frames it.
  - It is reachable from Project home → Evidence and from the editor's Project files rail.
- **The Vault surface.** `VaultVersions.tsx` (in Vault's detail panel) listed every version, with Download only.
- **The served policies.** The HTML can be served two ways:
  - **Express serves the SPA** (`NODE_ENV=production` or `SKIP_VITE`, `server/startup/frontend.ts`). `server/middleware/enterprise-security.ts` enforces `frame-src 'self'` and `object-src 'none'`, with a nonce `script-src`. Development sends the same directives report-only.
  - **CloudFront serves the SPA from S3** (the codified AWS stack, `terraform/modules/cloudfront/main.tf`, `deploy-aws.yml`). The document's policy is `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. It has no `frame-src` and no `script-src`; the module's own comment says a static-SPA `script-src` needs a check through a real distribution. That gap is the INF-04 residual (`SECURITY_AUDIT_2026-09-24.md`), noted again in the 2026-09-28 editor-family review.
- **The earlier proof.** The 2026-09-28 review's browser proof (`docs/evidence/reviews/2026-09-28/editor-family/fixes/SEC-A-3/browser/`) measured what Chromium's PDF viewer needs: no sandbox and no `csp` attribute. It ran from `file://`, under no served policy.
- **Framing elsewhere.** The viewer's frame was the only `<iframe>` in `client/src`, and nothing used `srcdoc`.

Searches run:
- `frameSrc` and `frame-src` across `server/`, `shared/`, `scripts/` and (after the review) `terraform/`;
- `createObjectURL`, `<iframe` and `srcdoc` in `client/src`;
- the SEC-A-3 evidence;
- `git log --all --diff-filter=D` on `*Viewer*`, `*viewer*`, `*Preview*` and `*preview*`. This finds the viewers the gap doc lists (`DocumentPreview.tsx`, `DocumentViewer.jsx`, `InlineViewer.jsx` and `DocumentViewerModal.jsx`, deleted in `7a144fd1e` over the retired `/api/documents` store). It also finds `AnnotatedViewer.jsx` and the other viewers of the deleted `_archive/src-legacy-20260124` tree. None reads the current Vault.

## What was wrong

**Where Express serves the SPA**, Chromium refused the viewer's frame: "Refused to frame 'blob:…' because it violates the following Content Security Policy directive: frame-src 'self'". The pane showed Chromium's error page (`01-red-browser.png`). Development is report-only, so it worked there. Every PDF opened from Project home → Evidence or the files rail failed in any deployment that serves the app from Express with `NODE_ENV=production`.

**Where CloudFront serves the SPA**, the frame was never blocked (`07-cloudfront-browser.txt`). The same measurement shows an HTML blob's inline script runs there, because that document has no script policy at all. On that stack the bytes rule is the only control.

## The change

1. **Policy.** `frame-src 'self' blob:` in both Express policies. `object-src` stays `'none'`, script and style sources are untouched, and `data:` stays refused.
   - A framed blob document inherits the Express policy, so an un-nonced inline script in an HTML blob does not run. The no-policy control does run it (`05-html-blob-browser.txt`).
   - `csp-nonce.test.ts` now loads each branch under its own `NODE_ENV` and names the header each one sends:
     - production enforces `frame-src` exactly `'self' blob:` and `object-src 'none'`;
     - development reports against the same `frame-src`.
2. **One viewer.** The download, classification, outcome report, object-URL hook and frame move from `ProjectFilesPanel.tsx` into `editor/vaultPdfViewer.tsx`. `ProjectFilesPanel.tsx` keeps only its pane and rail actions. A served `Content-Disposition` name ending `.pdf` now also counts as the file claiming to be a PDF, so the "named as a PDF but not one" wording is used when the Vault serves `protocol.pdf` under a different title.
3. **The bytes rule is a type** (security review 2026-10-22, finding 2):
   - `pdfViewerBlob` returns `PdfViewerBlob`, and `showPdf` takes only that;
   - `PdfFrame` frames only the `PdfViewerUrl` the hook minted.
   - `pdfFrameOneSite.test.ts` fails if any other file in `client/src` builds a frame (`<iframe`, `srcdoc`, `createElement('iframe')`).
4. **Vault reaches it.** `VaultVersions.tsx` offers View on a version whose file is named as a PDF (`VaultVersionViewer.tsx`):
   - it reads through the same audited route, and only a PDF is framed, with the served SHA-256 line and Close viewer;
   - a file whose bytes are not a PDF is downloaded, and the note says why;
   - a refusal says what the Vault said;
   - the URL is released on close.

## Evidence

The harness is in `harness/`:
- `serve.mts`: the real `cspNonce` and `securityHeaders` with `NODE_ENV=production`. It also serves CloudFront's policy string, read from the Terraform module, with no Express headers.
- `drive-pw.cjs`: Playwright with the pre-installed full Chromium 141.
- `run.sh`: runs the two together.

| File | What it shows |
|---|---|
| `01-red-browser.txt`, `.png` | Express policy on trunk `c6556aa1a`: the frame is refused and ends at `chrome-error://`. |
| `02-green-browser.txt`, `.png` | With `blob:`: no violation, and the PDF viewer renders the page ("PDF RENDERED OK", 1/1). |
| `03-red-unit.txt` | The new CSP cases against the policy on trunk: production and development `frame-src` both fail. |
| `04-green-unit.txt` | The CSP suite with the change, 21/21. |
| `05-html-blob-browser.txt` | Express policy: an HTML blob's script does not run; with no policy it does. |
| `06-red-vault-view.txt` | Vault Versions on trunk: no View. |
| `07-cloudfront-browser.txt` | CloudFront's policy: the PDF renders, and an HTML blob's script runs, since there is no script policy. |
| `08-mutation-one-frame-site.txt` | A second frame in `VaultVersionViewer.tsx`: the one-frame-site test names it and fails. |
| `09-green-client.txt` | Every client suite naming the viewer, Vault or its versions, plus the CSP and one-frame-site tests. |

## What remains

- **CloudFront's SPA policy** carries no `frame-src` or `script-src`. Adding `frame-src 'self' blob:` there changes nothing for the viewer. A `script-src` for a static bundle needs the browser check through a real distribution that the module's comment names. That is outside this slice, and Terraform is not runnable in this environment.
- **Firefox and Safari** have not been measured. Blob-document policy inheritance was shown in Chromium only.
- **Gap 3, work items 2 and 3:** DOCX renditions through `runDocxPdfPipeline`, and annotations pinned to page coordinates.
