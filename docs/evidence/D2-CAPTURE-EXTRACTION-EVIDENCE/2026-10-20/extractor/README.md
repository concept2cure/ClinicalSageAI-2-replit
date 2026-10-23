# Actual capture extractor — frozen fail-first proof

## What already exists

`server/services/clinical-regulatory-evidence/data-room-processing.ts` already
exports `extractCapture`, privately copies original bytes, computes their SHA-256,
uses the canonical automatic OCR budget, retains exact readable text and coverage,
and counts extractor page spans. It drops returned page maps and confidence.

`server/services/ocr/extractDocumentText.ts` already supplies actual page spans
and aggregate engine OCR confidence. `ocr/page-offsets.ts` already locates pages;
`ocr/ocr-budget.ts` already defines the automatic budget. This proof extends the
existing capture result; it does not add another extractor or manufacture pages.
The parent contract records the current/deleted-code searches and full boundary.

## Frozen baseline

Approved contract: `d2920b45d`, `../CONTRACT.md`. Production baseline:
`e79626c0849f0f8c2338b32f85d4bc69bccef8f5`.

Owned test: `server/services/clinical-regulatory-evidence/__tests__/capture-extraction-evidence.test.ts`
(162 lines). SHA-256:
`9544137f904f4170f2ba8e23d087d38a640ee7fca28ab89028e88f038410032a`.

Result: **36 expected failures, 7 passing controls, 43 total; exit 1**. Every red
is the meaningful missing receipt on an otherwise readable actual capture. No
missing module, import, setup or timeout failure occurs. `baseline-red.txt` is
the unmodified combined output. `baseline-command.json` records exact argv,
Node 22.23.3 path, canonical configuration, one worker, 4 GiB heap, times and six
before/after input hashes; every input remained unchanged during the baseline.

The test invokes the actual existing `extractCapture` export. Only the existing
extractor boundary is synthetic; the original hashing and capture behavior run.
Database access is mocked and asserted unused. No OCR engine, external database,
provider, compiler or Git mutation was invoked.

The expected receipts retain exact Japanese/emoji text identity, original byte
identity, genuine nonconsecutive/blank page spans, detached page objects and
reported OCR zero/100/fractional values. Negative scenarios must omit false page
locators (overlap, bad ordering, impossible offsets, split surrogate pairs) and
missing/invalid/non-OCR confidence, without changing text or page-count behavior.

Passing controls cover the existing byte copy, canonical budget, word/count and
detached coverage behavior; absent count/coverage; empty/whitespace/rejected
extraction; and refusal to issue a lossy receipt for ill-formed UTF-16.

Scoped ESLint with `--max-warnings=0` returned **0**; exact command and raw output
are retained. Test bytes are frozen for root's production implementation and
final green run. The tests establish metadata handling over synthetic extraction,
not OCR accuracy, calibrated scientific confidence or a live deployment.
