# A citation precise enough to be wrong is worse than one broad enough to be right

Third repair from the review in `../2026-10-12-review/`. Its subject-matter
lens read every statutory, regulatory and guidance claim the nine commits added
and judged them one by one. Most were right. Nine were not, and they are the
defects that matter most in a product whose output a reviewer reads: a sponsor
who checks a citation AnA gave them and finds it does not say what she said is
entitled to distrust everything else on the page.

## The nine

**Substantive — the claim itself was wrong**

| Where | What it said | What is so |
|---|---|---|
| `EU_MDR_CLASS_IIA` | a Class IIa device may use the Annex X type-examination | Article 52(6) gives Class IIa the Annex IX route or Annex XI; the type-examination is for Class IIb and III. The position now says so in as many words, and the Class IIb position carries the route that *is* open to it |
| `EU_CDX_IVDR_D` | "a companion diagnostic is Class C **or D** under the IVDR" cited to Annex VIII Rule 3(f) | Rule 3(f) yields **Class C**. Another rule may put a particular assay in Class D, which the position now says separately rather than attributing both to Rule 3(f) |
| `EU_MDR_CLASS_IIB` | "implantable Class IIb devices are assessed device by device" | Article 52(4) carves out sutures, staples, dental fillings and the rest of that list. Named |
| `multiple_predicates` | one case: features from several predicates sharing an intended use | the 2014 guidance allows **two** — more than one intended use each with its own predicate, or one intended use with features from several that share it. Both named, and what it still does not allow said plainly |
| `split_predicate` | "expect a Refuse to Accept decision or a finding of not substantially equivalent" | an RTA is a completeness decision. The consequence the guidance states is a finding of **not substantially equivalent** |

**Citations that pointed at a neighbouring provision**

| Where | Cited | Why it is wrong |
|---|---|---|
| `US_513G` | `21 CFR 860.123` | that is the reclassification petition. A 513(g) request rests on the statute and FDA's own procedures guidance |
| `US_QSUB` | `FD&C Act 515B` | 515B is the Breakthrough Devices Program, which a Q-Sub is not. The Q-Submission Program guidance is the citation |
| `EU_IVDR_CLASS_B` | `Art 48(7)` | the paragraph that carries Class C |
| `EU_CDX_IVDR_D`, `EU_IVDR_ART48_CONSULT` | `Art 48(6)` | the Class D expert-panel paragraph |
| `EU_IVDR_CLASS_CD`, `EU_REF_LAB` | `Annex IX Section 4.4` | the reference-laboratory verification is not in § 4.4 |

For the four IVDR paragraph citations I did **not** substitute the paragraph the
reviewer named. I cannot verify a paragraph of Article 48 from memory, and the
whole lesson of this slice is that a confidently wrong paragraph is worse than
an article. They now cite **the article and the annex**, which is true and
checkable, with Article 100 kept for the reference laboratory because that one
is the provision itself. The same discipline was applied to the De Novo
citations in the previous repair (`21 CFR 860 Subpart D` rather than a section).

**And one claim about the present**

`US_LDT` said FDA's 2024 enforcement position "has been challenged". It was
**vacated by a federal court in 2025** — and whether that is where the law now
rests is not something this platform tracks. The position says both: what
happened, and that AnA does not follow its status, so the obligation must be
confirmed before anyone relies on the route.

## Verification

- `pathway-positions.test.ts` (+5, 23): no IVDR position cites a paragraph of
  Article 48 or a section of Annex IX; Class IIa does not offer the Annex X
  route and Class IIb does; Rule 3(f) puts a companion diagnostic in Class C;
  the 513(g) and Q-Sub citations name their own procedures; and the LDT
  position says where it stands *and* that AnA does not track it.
- `predicate-positions.test.ts`: both multiple-predicate cases, what is still
  not allowed, and the overstated Refuse to Accept gone.
- `mutations.txt`: **9 mutations, all red** — each wrong citation restored, the
  Annex X route given back to Class IIa, "Class C or D" attributed to Rule 3(f)
  again, the LDT position claiming to know where the law rests, the
  multiple-predicate case narrowed again, and the Refuse to Accept promised
  again.
- Green: **711 tests** across the question engine, both catalogues and
  `tests/ana-intelligence`; `ci:typecheck:no-regression` 0 errors; the
  per-change lint ratchet reports no file gaining a warning.

## What this leaves

The lens raised two more I have not acted on, both because the fix is a
judgement rather than a correction:

- the PMA caution's "answerable basis" for a Class I/II device names a
  transitional device and a reclassified one; the reviewer says neither is that
  basis. The sentence is now the one place in the catalogue where I would want
  a regulatory affairs reader's view before rewriting it, because the honest
  alternative — "either the classification is in question or the route is" —
  drops the actionable half;
- whether "most Class I devices are exempt from premarket notification" should
  be stated as flatly as it is. It is right in substance and the § .9
  limitations are already named.

The rest of the review's open findings are in `../2026-10-12-review/README.md`.
