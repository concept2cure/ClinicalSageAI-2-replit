# AnA's answer check reads EU law, standards, EU guidance and EMA references

Plan package **F1** (a repair of shipped behaviour). Completes
`server/services/ana/answer-grounding.ts`. Finding **GRD-CITES**, recorded
2026-10-04 as "GRD-missed" in `../../2026-10-04/map-findings.md` and listed as a
next round in this lane's registry row. Launch rows D5 and D4.

## What already exists (RULE 3)

Searched: `answer-grounding`, `answer-check`, `citation`, `grounding`,
`2017/745`, `ISO 14971`, `MDCG`, `MEDDEV`, `EMA/CHMP`, in
`server/services/ana/**`, `server/services/ai-governance/**`,
`server/services/evidence/**`, `shared/ana/**` and
`client/src/concept2cure/components/ana/**`. Deleted files:
`git log --diff-filter=D -- '*answer-check*' '*answer-grounding*' '*grounding*'
'*citation*'` returns nothing — in the history this checkout holds, which
reaches back to 2026-10-17 only.

Twenty-odd files under `server/services/ana/` mention these forms. All of them
*write* such citations (the device, labeling, quality and submissions skill
libraries, the therapeutic-area profiles, `regulatory-pathway.ts`,
`medical-writing.ts`); none reads one out of an answer. One matters to this
change and is in the table: `citation-generator.ts`.

| Path | What it does today | What it does not |
|---|---|---|
| `server/services/ana/answer-grounding.ts` (`checkAnswer`) | The one deterministic comparison of an answer's specific claims with the turn's sources: trial and literature ids, FDA submission numbers, CFR, ICH, quotes, figures; five outcomes per claim; engine version recorded with every check. | Read any EU regulation, standard, EU guidance document or EMA reference. |
| `server/services/ana/answer-check-sources.ts`, `answer-check-figures.ts` | How a source is read (own text, records, the model's input, model-written text) and how a figure is held. | — (used unchanged) |
| `server/services/ana/grounding-core.ts` (`CITATION_PATTERNS`) | A sentence-level marker list: is this sentence cited at all. It has `(Smith et al., 2021)` and US/ICH markers; another session added the product's own `[citation: …]` label on 2026-11-10 (`eee0aaa0b`). | Compare a citation with a source. Not changed here. |
| `server/services/ai-governance/groundedness.ts` | A second marker list for a different scorer. | Same. Not changed here. |
| `server/services/ana/citation-generator.ts` (the `generate_citation` tool) | Formats an `eu_mdr` citation as "Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, <identifier>." and an `iso_standard` one as the identifier, both marked `verification: 'not_verified'`. | Verify either against a source — which decided how "asked for" is read below. |
| `client/src/concept2cure/components/ana/AnswerCheckRows.tsx` | Renders the check under every answer and in the sign-off dialog, naming each claim's kind. | Had no word for the new kinds (it would have shown the raw kind). |
| `shared/ana/answer-check-reader.ts` | Reads a stored check; a claim's kind is any string. | — (no allowlist to extend) |

So this is a **completion of `answer-grounding.ts`**, not a new check. The new
extractors are split into `server/services/ana/answer-check-citations.ts`,
beside the two existing `answer-check-*` files, because the parent file is
already over the 500-line limit.

## The defect, run against the engine as it was

Eight probe answers, each with a tool result as its source. Every one returned
`claims=0`:

    Clinical evaluation follows MDR Article 61 and Annex XIV Part A.        claims=0
    See Regulation (EU) 2017/745, Article 61(1), and Article 56 of the IVDR. claims=0
    Risk management follows ISO 14971:2019 … IEC 62304; IEC 60601-1-2 …      claims=0
    ISO/IEC 27001 and EN ISO 13485:2016 apply; see ISO/TR 24971:2020.        claims=0
    MDCG 2020-6 and MEDDEV 2.7/1 rev. 4 describe sufficient clinical evidence. claims=0
    GCP is EMA/CHMP/ICH/135/1995 (formerly CPMP/ICH/135/95); …               claims=0
    The CTA is filed under Regulation (EU) No 536/2014 and Directive 2001/83/EC. claims=0
    As shown by (Smith et al., 2021) and Jones 2019.                         claims=0

Two consequences, both read at the line:

- `server/services/ana-ri/response-contract.ts:248` — with zero claims the strip
  says *"No specific claims to check against this turn's sources."* Under a
  device answer that cites the MDR in every sentence, that is false comfort.
- `server/services/ana/memory-fact-check.ts:126` — a memory item with zero
  claims has nothing to withhold, so one resting only on such a citation stood
  in project memory unchecked.

It fell on the clients it should serve most: a device or diagnostics sponsor
cites the MDR, the IVDR, ISO/IEC standards and MDCG guidance constantly, and
since P-73 trial-application drafting covers every region.

## What is read now

| Kind | Read | "Found" means |
|---|---|---|
| `eu_law` | An EU regulation or directive by number; the MDR and IVDR by name **with a provision**; articles (with paragraphs), annexes, and lists of either | A source holds that provision of that act, by either of the act's names |
| `standard` | ISO, IEC, ISO/IEC, EN, with TR/TS/PAS, part and edition | A source holds the number with a designation before it |
| `eu_guidance` | MDCG and MEDDEV documents, with revision | A source holds the document (and the revision, if the answer states one) |
| `ema_ref` | EMA / EMEA / CHMP / CPMP … reference numbers | A source holds the same number and year under any agency prefix |

The rule is the file's own for CFR and ICH: these can be recalled correctly, so
a miss means *not in this turn's sources*, never *fabricated*.

**Finer is not coarser.** A source that holds Article 61(4) does not hold 61(1);
one that holds ISO 14971 undated does not state the 2019 edition; IEC 60601-1 is
not 60601-1-2; MEDDEV 2.7/1 rev 3 is not rev 4. The other way round holds: cited
whole, any paragraph, part or edition of it is it. An edition is strict on
purpose — editions differ in substance and a harmonised-standards list names
one — and the claim's text shows the edition, so the reviewer sees what was not
found.

**An answer is read by its words; a source also by nearness.** A tool's record
keeps the act and the article in separate fields, so a source binds a provision
to the nearer act within 200 characters. An answer is never read that way: it
would be handed a citation it did not write.

**What the model asked for is found only in a record — and "asked for" is read
loosely.** This is the part the first version of this change got wrong, and the
existing code is what showed it. AnA's own `generate_citation` takes an
identifier of "Article 61" under `source_type: eu_mdr` and replies
"Regulation (EU) 2017/745 …, Article 61", unverified. The first version asked
whether the call's input held *the claim* (act and article together); it did
not — the act was in another field, spelled `eu_mdr` — so the reply was read as
a source and the model's own request confirmed itself. That is the mistake
round 1 of this engine was overturned for. "Asked for" is now the provision, or
the number, in whichever fields the call split it across, exactly as the CFR
reader already asks only for the section. Written as a failing test first
(`3 failed | 33 passed`), from the formatter's real output.

The same reading of that formatter added one more form to the answer side: the
act's official title is part of its name where it is written out, so the
citation `generate_citation` produces is read as the provision it cites rather
than as a bare act.

## What is deliberately not read

- **An article or annex with no act beside it.** After "Under the MDR, …" a
  later "Article 62" is probably the MDR's. A guessed act would be reported as
  a claim the answer never made in those words.
- **"MDR" or "IVDR" alone.** In a US device file an MDR is a Medical Device
  Report; the name is the regulation only beside a provision.
- **A bare "EN" and four digits.** Also a form number, or a year.
- **Author-year references** ("Smith 2021"). Any capitalised word before a year
  has that shape; it needs its own design. Still open.
- **The sentence-level marker lists** (`grounding-core.ts`,
  `groundedness.ts`): a figure cited to ISO 14971 can still be listed there as
  uncited. A separate file, last changed by another session two days ago.
  Still open.

## The engine version, and what the bump costs

`ANSWER_CHECK_VERSION` is `answer-check/3`. The file requires a bump "on any
change to what it finds". `memory-fact-check.ts` accepts only a check made by
the current engine, so answers stored with a `/2` check stop vouching for memory
until they are checked again. That is fail-closed and by design; it is stated
here so nobody meets it as a surprise. Four tests pinned the literal `/2`
against the real engine and move to `/3`; client fixtures that depict a stored
`/2` check are left as they are.

## Red, then green

Red (the tests against the engine as it was): `21 failed | 6 passed (27)`. The
six that passed were the trouble — "found" cases asserting only an empty
`notFound`, which is also empty when the citation is never read. Every such
assertion now also requires at least one claim (`allFound`), and with the wiring
removed `26 failed | 5 passed`.

Green: 37 cases in `tests/services/answer-check-citation-forms.test.ts`. The 20
suites that touch the answer check pass, 240 tests, after the four version pins
moved.

## Mutants: 33 of 33 killed

`mutants.txt`. Three survived a first run, and each was a hole in the tests,
not in the code:

- *an EMA reference credited by any year* — no case differed only by year;
- *an annex numeral credited by a longer word* — no case had a word after
  "Annex" beginning with a numeral's letter ("Annex Information", "ANNEX
  IVD-SPECIFIC");
- *an act cited bare is never "asked for"* — no case asked a tool for an act
  by its number alone.

Each case was added and each mutant dies. One entry of a middle run was an
anchor miss — the line it replaced had been rewritten, so nothing was mutated
and the "run" exercised the real code. The script counts a miss as not killed,
never as a kill, and it was re-anchored and re-run.

## Cost

A 619 KB source of 4,000 paragraphs, each citing an article, an annex, a
standard, a guidance document and an EMA reference, against an answer of 81
citations: 97 ms, where the same source with no citations in the answer takes
74 ms (measured before the "asked for" rule was added; that rule reads only a
call's input, which is short). The first version of the binding took 507 ms on it (it sliced the text
between every act and every provision); it now looks only at the act just before
and just after. A source's reading is kept for one answer's check and not
beyond it.
