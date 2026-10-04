VERDICT: **Defect found.** Claims (1), (2) and (4) are refuted. Claim (3) holds except in one edge (an `authorId` taken from the request). Claim (5) holds.

**How the probes were run.** The working tree has another session's uncommitted edits to `server/services/ectd/leaf-pdf-renderer.ts`, `server/export/authoring-section-content.ts`, a new `server/export/section-html-parse.ts` and `authoring-html-sanitizer.ts`. So every probe imports a `git archive 283fe08c4` copy (server, shared, db, migrations, tests/setup.ts) unpacked at `<S>/tree`.
- `<S>` = `<review-scratch>`
- Run with: `cd <S> && env -u DATABASE_URL RLS_ENFORCE=off npx vitest run --config ./vitest.config.ts <file>`. Each file's output is in `<S>/out-*.log`.
- Route probes use the copied PGlite harness: the real `/api/claude/batch` and the real accept route, with only the model stubbed.
- Unless a defect says otherwise, the record is `<p>The study drug was well tolerated in all cohorts.</p>` and the claim sent is that draft unchanged.

## Defects

**D2. Tag-shaped tokens that the leaf and the export show as text are stripped by the lineage. Blocker. In scope.**
- **Input:** `<p>The study drug was well <b"3 patients died"> tolerated in all cohorts.</p>`. Also `<b/…>`, `<b,…>`, `<i(…)>`, `<u=…>`, and any ASCII punctuation right after the tag name.
- **Expected:** not credited. The eCTD leaf and the export show the words.
- **Actual:** span `accepted_machine_draft:ana`; audit says "AnA batch draft accepted into document"; `lastDraftModel` is `model-of-record`.
  - Leaf: `"The study drug was well <b\"3 patients died\"> tolerated in all cohorts."`. The export shows the same.
  - A browser (jsdom) hides the token. The tag pattern in node-html-parser does not match it, so the leaf and export print it.
- **Probes:** `route.probe.test.ts` ("D2 …") and `readers.probe.test.ts`.
- **Uncommitted fix does not close it:** `inflight.probe.test.ts` shows the other session's `section-html-parse.ts` still prints it.
- **Fix:** in `comparableText`, strip only tags every reader hides: a known tag name followed by whitespace, `/>` or `>`, with attribute syntax node-html-parser also accepts. Anything else stays in the needle, so the clause fails closed.

**D5. `<img alt>` on an inline PNG passes the figure rule, and the leaf prints the alt inside the credited clause. High. In scope.**
- **Input:** `…well <img src="data:image/png;base64,iVBORw0KGgo=" alt="3 patients died"> tolerated…`
- **Actual:** `refusedFigures` returns `[]`; span is AnA's; leaf shows `"The study drug was well\n[Figure: 3 patients died]\n tolerated in all cohorts."`
- **Probes:** `route.probe.test.ts` "D5", `attributes.probe.test.ts`.
- **Fix:** a clause holding a tag whose attributes some reader prints (alt, data-note, data-cite-locator) is not compared.

**D1. Text inside `<pre>` is raw to node-html-parser. High. In scope.**
- **Input:** `<pre><b 3 patients died>The study drug was well tolerated in all cohorts.</b></pre>`
- **Actual:** span is AnA's, wording names AnA. Leaf and export show `<b 3 patients died>The study drug…</b>`.
- An unclosed or wrong-case `</PRE>` runs raw to the end of the content (probe D1b).
- **Probes:** `route.probe.test.ts`, `readers.probe.test.ts`.
- **Uncommitted fix closes it** if it lands (leaf and export; `inflight.probe.test.ts`), but this change does not. Until then, treat `<pre` as a region opener.

**D4. The co-author editor opens content in source mode and shows every character. High. In scope.**
- Claim (1) says this reader reads HTML when a known tag is present. But `RichSectionEditor` opens content holding `<figure|svg|video|embed|object>`, or content its fidelity gate calls lossy, in source mode.
- **Input:** `<p>…well <b 3 patients died>tolerated</b> in all cohorts.</p><figure></figure>`
- **Actual:** the route credits AnA. jsdom render shows `textarea.rse-source` containing the raw string with `3 patients died`. Control without `<figure>`: the rich canvas hides it.
- **Probes:** `editor-source-mode.probe.test.tsx`, `route.probe.test.ts` "D4".
- This also refutes the README's "Not done here" premise that attribute text is hidden from every HTML reader.
- **Fix:** share the editor's source-mode test and apply the plain-text rule to such content.

**D3. `<template>` and `<head>` hide words from the leaf in a clause the lineage credits. High. In scope.** This breaks the module's own invariant, though perhaps not the literal wording of (1).
- **Record:** `<p>The study drug was not effective in reducing mortality.</p>`
- **Content:** `<p>The study drug was <template>not </template>effective in reducing mortality.</p>`
- **Actual:** credited to AnA, reason "AnA batch draft accepted". Leaf shows `"The study drug was effective in reducing mortality."` The meaning is reversed in the filed leaf. Still present with the uncommitted fix.
- **Probes:** `route.probe.test.ts` "D3", `readers.probe.test.ts`.
- **Fix:** add the leaf's dropped tags (template, head) to `RAW_TEXT_OPENER`.

**D6. The export prints attribute text as footnotes and citation locators. Medium. In scope.**
- **Input:** `<sup data-note="3 patients died">tolerated</sup>` or `<a data-cite="src-1" data-cite-locator="3 patients died"></a>`.
- **Actual:** clause credited. Export runs carry `footnote: "3 patients died"` or `citationLocator: "3 patients died"`, which render as a DOCX footnote or as `[n, 3 patients died]`. The editor's citation node also paints `[n, locator]` when the source resolves.
- **Probe:** `attributes.probe.test.ts`. Fix as in D5.

**D7. An inline tag joins two of AnA's tokens. Medium. In scope.**
- **Record:** `At Week 2 4 patients reported headache.`
- **Content:** `<p>At Week 2<b>4</b> patients…</p>`
- **Actual:** credited (comparison form `at week 2 4 …`). Leaf and export show `At Week 24 patients`.
- **Probe:** `attributes.probe.test.ts`.
- **Fix:** replace inline tags with nothing and block tags with a space, on both sides of the comparison.

**D8. The verifier's markdown reading drops every `*`. Medium. In scope.**
- **Record:** `The starting dose was 5*10 mg/kg…`
- **Claim and content:** `…510 mg/kg…`
- **Actual:** verified; whole span `accepted_machine_draft:ana`; model named. No reader of the record shows "510": a lone `*` renders literally.
- **Probe:** `route.probe.test.ts` "MD-asterisk".
- **Fix:** drop only paired emphasis delimiters and list markers that start a line; never a lone `*` inside a word.

**C2. Honest, unedited drafts are not credited (refutes claim 2). Medium. In scope.**
- **Inline style:** draft, content and claim are all `<p style="text-align: justify">Not applicable to this product.</p>`.
  - Actual: spans `[0,21]` and `[22,66]` are both `author_assertion`. Reason "…credits none of it to AnA", `lastDraftSource` `batch-not-ana`, `lastDraftModel` null. Every reader shows exactly AnA's sentence.
  - Cause: the clause splitter cuts at `": "` inside the tag.
  - Fix: mask tags before `detectSpans`, keeping the same length.
- **Region rule on plain-text content:** a markdown draft with an XML example ```` ```xml <leaf><title>…</title></leaf> ``` ````.
  - Actual: every later prose clause is `author_assertion`, though the leaf and export show it verbatim. The same rule also drops carried-forward accepted clauses on every caller, for example plain text containing "<style guide>".
  - Fix: apply the region rule only when `looksLikeHtml(content)` is true.
- **Weaker case:** `<LLOQ … >3×ULN` across clauses is not credited because the whole-claim strip crosses clauses. This is defensible only because the committed leaf parses plain text as HTML.
- **Probe:** `route.probe.test.ts` "C2 …". These three tests fail by design: they assert the claim.

**AUTH. `authorId` comes from the request (refutes claim 4, and claim 3 in this case). Medium. Pre-existing parser bug, propagated by the new verifier.**
- `acceptedMachineText` checks `MACHINE_AUTHOR_IDS[authorId]` by truthiness, so `"constructor"` passes (likewise `__proto__`, `toString`, …).
- **Actual:** the claim verifies; the span is `accepted_machine_draft:constructor`; the audit and `lastDraftSource` still say AnA.
- **Probe:** `route.probe.test.ts` "AUTH".
- **Fix:** take `authorId` from the record (`ANA_MACHINE_AUTHOR_ID`) in `verifyMachineText`, or use `Object.hasOwn`.

**DUP. Repeated claims defeat the occurrence bound. Low.**
- The record holds the sentence once; the content repeats it three times.
- One claim credits one clause. The same claim sent three times credits all three.
- **Probe:** `route.probe.test.ts` "DUP".
- **Fix:** dedupe verified claims by comparison form.

**FIG. The figure rule misses images inside `<template>`. Low. The figure rule on this door is part of this change.**
- `<template><img src="https://tracker.example/pixel.png"></template>` passes `refusedFigures`, and the export reads it as an image block. Control without `<template>` is refused.
- **Probe:** `figure.probe.test.ts`.
- **Fix:** also scan `template.content`.

## What held
- **Claim (5):** 2,000,000 generated strings over a broader alphabet (upper case, CR, tab, NUL, non-ASCII, whole tag names) gave 0 differences from the frozen regex. Nine adversarial 400k-character inputs each ran in 2 ms or less.
- **Tenant scoping and record integrity:** another organization's record gives `turn_record_not_found`; an upper-case id verifies. Tampering is blocked by the immutability trigger.
- **Model:** never read from the body. One `turnRecordId` covers every claim, so mixed models cannot occur. It is null when nothing is credited.
- **Verdict row, empty content, figure refusal:** all stop the accept before any write (the template gap above aside). The lineage runs after `FOR UPDATE` in the same transaction; concurrency was checked by reading the code only, since PGlite cannot run two connections.
- **Comparison edges that fail closed:** comments, `<?…>` and `</ x>` stay in the comparison and fail closed. The raw-text openers cover every browser raw-text state. `\|`, prefix claims, CRLF and case variants behave as intended.
- **Other callers:** carry-forward into a raw-text region or into plain text is correctly dropped. `content` is passed by the only caller of `attributeMachineSpans`, and the new return type is additive.

## Not fixed by this change, for the record
- D1–D7 also reach the authoring AI-draft accept (`authoring.router.ts:3673`), where the member edits the content and the lineage is shared.
- The authoring PATCH still records client-claimed machine text unverified. That is the SEC-A-7 door, documented as open, and turn records now exist to close it.
- A requester can make AnA echo their text verbatim (`existingContent` or the prompt). The record then holds it as AnA's output.