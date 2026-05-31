# AnA Document Formatting & Template Engine — capability brief

> Companion to `MUTATION_PRIMITIVES_BRIEF.md` and `FILE_UPLOAD_MEMORY_BRIEF.md`.
> Specifies how AnA formats text, builds client templates, recreates the
> formatting of uploaded documents (fonts, logo, margins, header/footer), and
> produces matching Microsoft Word (`.docx`) **and** PDF — all through
> conversation. **Foundation is shipped in this PR** (backend, tested);
> remaining items are flagged as follow-up.

---

## 0 · The contract (hard rule)

A client gives AnA a document and says "make ours look like this." AnA must be
able to:

1. **Read** the uploaded `.docx`/`.pdf` and **recreate its formatting** — page
   size, margins, body + heading fonts and sizes, brand colours, the embedded
   logo, and the running header/footer — as a reusable **template**.
2. **Build or adjust** a template conversationally — "make the margins 1 inch,
   use Calibri 11, put our logo in the header" — with no settings panel.
3. **Produce** any document in a saved template, as both a Word file and a PDF
   that match the client's format exactly.

The formatting is **data**, not hard-coded. One renderer-neutral `TemplateSpec`
drives every output. We do **not** introduce a second document generator — the
engine binds the spec to the existing `docxFactory` and PDF pipeline.

---

## 1 · What shipped in this PR (backend foundation)

| Piece | File | Status |
| --- | --- | --- |
| Canonical spec model + sanitiser | `server/services/templates/templateSpec.ts` | ✅ tested |
| Upload → spec extractor (`.docx` full, `.pdf` best-effort) | `server/services/templates/templateExtractor.ts` | ✅ tested |
| Spec → existing generators (docx style + pdf options) | `server/services/templates/templateRenderAdapter.ts` | ✅ tested |
| Spec → print-CSS HTML (input to existing HTML→PDF) | `server/services/templates/templateHtml.ts` | ✅ tested |
| Logo intrinsic-size reader (PNG/JPEG/GIF) | `server/services/templates/imageSize.ts` | ✅ tested |
| Template store (CRUD + audit) | `server/services/templates/templateStore.ts` | ✅ |
| `docxFactory` made **template-driven** (was hard-coded) | `server/services/docx/docxFactory.ts` | ✅ tested (round-trip) |
| REST API | `server/routes/c2c/templates.ts` → mounted `/api/c2c/templates` | ✅ |
| Schema | `migrations/20260531_template_specs.sql` (`c2c_template_specs`) | ✅ |
| AnA-callable actions | `ai-actions/handlers/{extract-template-from-upload,render-document-with-template}.ts` | ✅ |
| AnA awareness | `ana-capability-registry.ts` — `formatting` category (3 capabilities) | ✅ |
| Unit tests (25) | `tests/services/template-engine.test.ts` | ✅ pass |

The key surgical change: `docxFactory.generateRegulatory(input)` now accepts an
optional second argument `generateRegulatory(input, style)`. With no style it
reproduces the **exact** original regulatory look (verified by test), so every
existing caller is unaffected; with a `DocxStyle` (derived from a `TemplateSpec`)
it renders in the client's format and can place an embedded logo on the cover or
in the header.

---

## 2 · The `TemplateSpec` model

Renderer-neutral; units are human-friendly (inches, points, hex). The adapter
converts to docx twips/half-points and pdfkit points.

```ts
interface TemplateSpec {
  specVersion: 1;
  page:       { size: 'letter'|'a4'|'legal'; orientation; marginsInches{top,bottom,left,right} };
  typography: { bodyFont; headingFont; monoFont; bodySizePt; heading1..3SizePt; lineSpacing; paragraphSpaceAfterPt };
  colors:     { text; muted; accent; tableHeaderBg; tableBorder };       // hex, no '#'
  brand:      { organizationName?; logo?{ dataBase64; mimeType; placement:'cover'|'header' }; confidentialityNotice? };
  header?:    { text?; showLogo?; alignment? };
  footer?:    { text?; showPageNumbers?; pageNumberFormat? };            // {PAGE}/{PAGES} tokens
  table:      { headerBold; borderSizePt };
  formFields?: TemplateFormField[];                                       // detected fields (see §6)
  namedStyles?: TemplateNamedStyle[];                                     // styles.xml mapping (informational)
}
```

`normalizeTemplateSpec(partial)` is the single sanitiser — used on read (jsonb →
spec), on extraction, and on every conversational edit. It deep-merges onto
`DEFAULT_TEMPLATE_SPEC` and clamps/coerces every field, so a stored or
AnA-edited spec is always complete and safe to render.

---

## 3 · Extraction (the "recreate the form" capability)

`extractFromDocx(buffer)` reads the OOXML zip directly:

- `word/document.xml` — last `<w:sectPr>` → page size (classified to
  letter/legal/a4) + margins (twips → inches).
- `word/styles.xml` — `docDefaults` → body font/size/colour; `Heading1..3` →
  heading fonts/sizes; theme references (`w:asciiTheme="minorHAnsi"`) resolved
  via `word/theme/theme1.xml`.
- `word/header*.xml` / `word/footer*.xml` — running text + logo presence +
  page-number field detection.
- `word/media/*` — the embedded logo (smallest image, base64).

Returns `{ spec, confidence (0–1), warnings[], source }`. Confidence and warnings
are surfaced so AnA says how sure it is and asks the user to confirm before
saving (`verified` flag). `.pdf` extraction is best-effort (page geometry only —
a flat PDF has no style sheet) and clearly flagged with low confidence.

---

## 4 · Production (Word + PDF, no second engine)

- **DOCX** — `renderDocxWithTemplate(spec, document)` → `templateSpecToDocxStyle`
  → existing `docxFactory.generateRegulatory(input, style)`.
- **PDF** — `templateSpecToHtml(spec, document)` produces print-ready HTML
  (CSS `@page` margins/size, fonts, colours, embedded logo) → existing
  `renderHtmlToPdf()` in `server/export/renderers.ts`. The platform's existing
  PDF pipeline stays the single source of truth for rasterisation; the template
  only supplies the look.
- **Project PDFs** — `templateSpecToPdfOptions(spec)` maps to the styling subset
  (`pageSize`, `fontFamily`, `fontSize`, `margins`) that
  `documentExportService.generatePDF()` already accepts, so eCTD/project exports
  can adopt a client template without code changes to that pipeline.

---

## 5 · API + AnA conversation surface

```
GET    /api/c2c/templates                 list (org + optional ?projectId)
POST   /api/c2c/templates/extract         (multipart) preview a spec from an upload
POST   /api/c2c/templates/from-upload     (multipart) extract + save
POST   /api/c2c/templates                 create from a provided spec
GET    /api/c2c/templates/:id             fetch
PUT    /api/c2c/templates/:id             update name/description/spec/verified
DELETE /api/c2c/templates/:id             deactivate
POST   /api/c2c/templates/:id/render      { format:'docx'|'pdf', document } → file
```

All org-scoped (behind `authMiddleware`); every mutation writes an `audit_logs`
row (`c2c.template.{create,update,deactivate}`).

**AnA awareness** — three capabilities registered under the `formatting`
category in `ana-capability-registry.ts` (`/extract-template`, `/template`,
`/produce`), so they appear in AnA's system-prompt capability list.

**AnA execution** — two handlers on the existing AI Action registry
(`POST /api/ai-actions/execute`):
- `extract_template_from_upload` — reads vault bytes
  (`getStorageProvider().get(vaultVersionId)`), extracts, and saves the
  template. Pairs with the paperclip upload from `FILE_UPLOAD_MEMORY_BRIEF`.
- `render_document_with_template` — mirrors `export_document`: returns the
  render URL + payload the client posts to download the `.docx`/`.pdf`.

Conversational flow: user drops a form on the paperclip → upload lands in the
project vault (`FILE_UPLOAD_MEMORY_BRIEF`) → AnA calls
`extract_template_from_upload` → confirms the recreated format and asks to save
→ user later says "produce the CSR in Acme's format" → AnA calls
`render_document_with_template`.

---

## 6 · Follow-up (not in this PR)

1. **Form-field recreation.** `TemplateSpec.formFields` is modelled but the
   extractor does not yet detect fillable fields/checkboxes/signature blocks
   (`<w:sdt>` content controls, `<w:fldChar>` form fields). Add detection +
   round-trip rendering for true "recreate the exact form."
2. **PDF cover logo via pdfkit.** The HTML→PDF path renders the logo; the
   project `documentExportService.generatePDF` cover does not yet draw it. Add a
   `logoBuffer` option there for parity on eCTD exports.
3. **Higher-fidelity PDF extraction.** Optional font/positional heuristics for
   `.pdf` uploads (currently page-geometry only).
4. **Conversational edit grounding.** Persist template edits as memory atoms so
   AnA recalls "Acme uses Calibri" across sessions
   (`FILE_UPLOAD_MEMORY_BRIEF` pattern).

---

## 7 · UI — routed to the design system (per `CLAUDE.md`)

This brief is **backend-only**. Any template-management or template-picker
surface (browse client templates, preview the recreated format, confirm an
extraction, choose a template at export time) must be **designed in `ui_kits/`
first** and implemented per `HANDOFF.md` — do not invent UI here. The
`authoring` and `mdx` AnA composers already carry the paperclip and AnA dock the
conversational flow needs; wiring those to these endpoints is the
implementation step once the surface ships.

---

## 8 · Acceptance

- [x] `docxFactory` is template-driven; default output byte-compatible look preserved (test).
- [x] `extractFromDocx` recovers page size, margins, fonts, colour, header text + logo (test).
- [x] `renderDocxWithTemplate` produces a `.docx` whose margins/fonts come from the spec (round-trip test).
- [x] `templateSpecToHtml` emits `@page` margins + fonts + embedded logo; escapes content (test).
- [x] REST endpoints are org-scoped and audited; render returns a real `.docx`/`.pdf`.
- [x] AnA aware (capability registry) and able to invoke (AI Action handlers).
- [x] `c2c_template_specs` migration is idempotent and FK-free (preview/CI safe).
- [x] `npx vitest run tests/services/template-engine.test.ts` green (25/25); touched files typecheck clean.
- [ ] Form-field recreation (follow-up §6.1).
- [ ] Template-management UI designed in `ui_kits/` (follow-up §7).
