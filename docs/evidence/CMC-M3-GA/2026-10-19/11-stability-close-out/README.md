# The dossier's shelf-life claim, recorded by an ordinary PUT

`shelf_life` is the value §3.2.S.7.1 / §3.2.P.8.1 prints as the proposed storage
period, and the value the ICH Q1E rule judges a programme's claim against. Until
2026-10-19 it was set together with the terminal status by an ordinary edit:

```
— the close-out, through an ordinary PUT: a shelf-life claim and a terminal status —
  HTTP 200
  stored: status=COMPLETED shelfLife='36 months at 25C/60%RH'

— and is there any signature row for it? —
{"success":true,"data":[]}

— what the ledger recorded —
cmc.register.create|3|{"register":"stability_study",…}
cmc.register.update|3|{"register":"stability_study",…"changed":{"notes":…}}
```

200, no `electronic_signatures` row, no reason, no re-authentication. The edit
audit landed (that is slice 08, the same day), so the platform could say **who
changed it** — but not that anyone had **signed for** the claim. It was the last
ungoverned signed state in the CMC registers after the 2026-10-18 ceremony
generalisation, and the most consequential: a 36-month claim over 24 months of
data is the one fabrication an inspector is certain to look for.

---

## The change

- **Two columns**, `migrations/20261019_stability_shelf_life_signature.sql`:
  `shelf_life_signed_by integer` and `shelf_life_signed_at timestamp`, plus a
  partial index. Additive, `IF NOT EXISTS`, replay-clean (applied twice here,
  second run silent — RULE 1), **no backfill**: a study closed out before this
  has no signer, and inventing one is the fabrication the columns prevent.
- **A `SIGNED_REGISTERS` entry**, so the one descriptor drives the create
  refusal, the edit refusal, the ceremony's SQL and the client's status control
  — the eighth register on that path.
- **`POST /api/cmc/stability-studies/:id/close-out`**, on the shared ceremony,
  with a two-part precondition.
- **The drawer is now the ceremony.** `stabilityCloseoutForm` carried
  `{shelfLife, status: 'COMPLETED', notes}` as one PUT; it now carries the shelf
  life, the basis, the meaning, the reason and the re-authentication, and the
  surface sends the evidence then the signature. Its status dropdown is gone:
  there is one terminal state a close-out reaches, and offering a list implied
  otherwise.

### Why the shelf life is still an ordinary edit

The same shape as every other register: the evidence is **recorded**, then the
signature **accepts** it. A method's ICH Q2 package, a process-validation
report, a comparability justification — each is entered by an ordinary (audited)
edit and the ceremony refuses to sign when it is missing. The shelf life is that
evidence here; the terminal status is the signed act. After the signature the
record's content is closed, so the claim cannot move under the signature.

### The precondition, and why it has three answers

```
  with both, but no shelf life recorded     409  This study records no shelf life, so there is nothing to sign for…
  shelf life recorded, but no results       409  This study has no recorded pull-point results, so "24 months at 25C/60%RH" is a claim over no data…
  a recorded series that cannot be read     409  This study’s recorded results could not be read, so what the shelf life rests on cannot be established…
```

Three different states, three different refusals. The middle one is the Q1E
lesson made a precondition: **a planned schedule is not data**
(`docs/evidence/CMC-M3-GA/2026-10-18/06-ich-q1e-verdict/`), so a signature over
a study with nothing pulled is refused rather than made into a governed
fabrication. The third is `readRecordedStabilityResults`' own distinction —
unreadable data is not absent data — carried into the ceremony, because a
signature is not made over a series the platform cannot parse.

---

## After, on the running product

`probe-closeout.sh`, every half of the ceremony in the order a scientist meets
them (`after.txt`):

```
── the create ──
  a study created already COMPLETED        409  Closing out a stability study with its shelf life is a governed action…

── the ordinary edit ──
  PUT status COMPLETED with a shelf life   409  Closing out a stability study with its shelf life is a governed action…
  PUT the signature columns directly       400  Invalid payload
  the stored row after both attempts       status=ACTIVE shelfLife=None

── the ceremony ──
  close out with no reason                 400  Invalid input data
  with a reason, no re-authentication      401  REAUTH_PASSWORD_REQUIRED
  …the three preconditions above…
  with everything recorded                 200  status=COMPLETED shelfLife='24 months at 25C/60%RH' signedBy=3 signedAt=2026-10-19T03:31:02

── after the signature ──
  an ordinary edit of the closed-out study 409  This stability study is COMPLETED under a recorded signature…
  returning it to ACTIVE                   409  This stability study is COMPLETED under a recorded signature…
  closing it out twice                     409  This stability study is already COMPLETED
  the §11.50 signature row                 1 row(s): meaning=approval signer=JM Smith
```

Nothing was stored by either refused write — the row is still `ACTIVE` with no
shelf life after both attempts, which is the assertion that distinguishes a
refusal from a 409 over a write that happened anyway.

---

## What case cost, and how it was found

Every other register's signed word is lower-case. The stability register's
vocabulary is upper-case — 301 rows hold `ACTIVE`/`PAUSED`, the status chip
compares the word exactly — so the descriptor keeps each register's own casing
and **every comparison lowercases both sides.** Four comparisons read that word,
and three were written against lower-case input only. Each would have failed
silently in a different direction:

| Comparison | What it would have done |
|---|---|
| `isSigned` (`signed-record.ts`) | a closed-out study would not be *signed*, so its content would stay open to ordinary edits |
| `vocabFor`/`ungovernedQualificationRefusal` (`register-writes.ts`) | the create and edit guards would never fire, leaving the defect exactly as it was |
| the already-signed check (`routes.ts`, inside the signing transaction) | **this one was observed**: a second close-out answered 200 and re-stamped `shelf_life_signed_at` over the first signer's — 03:20:19 became 03:20:35 |
| the retire path (`signed-record.ts`) | retiring a closed-out study would be refused with "that study is not COMPLETED" while it plainly was |
| the client's `statusOptionsFor` / `statusDefaultFor` | a closed-out study's drawer would open on `draft` — the same shape as the validated-process defect that parameter exists to fix |

The second close-out is the one a probe caught, and only after the probe itself
was corrected: the first attempt used the reason `"Again."`, got **400 Invalid
input data** from the reason's minimum length, and that 400 hid the 200
underneath it. A probe whose refusal comes from the wrong check reads as a
passing guard.

`stability-close-out.test.ts` pins all five. Against the raw comparisons, 7 of
its 15 cases fail (`case-sensitive-comparisons-fail.txt`):

```
× isSigned reads the stored word whatever its case > recognises the register’s own upper-case word
× an ordinary edit cannot reach the close-out > refuses the transition into COMPLETED, naming the governed path
× an ordinary edit cannot reach the close-out > refuses returning a closed-out study to a running state
× a closed-out study is closed to content edits > refuses a new shelf life, naming the state and the way out
  … Tests  7 failed | 8 passed (15)
```

The descriptor-vs-schema test also refused the new entry until it was registered
in that test's own table — `expected [ 'analyticalMethods', …(7) ] to deeply
equal [ …(8) ]` — which is the gate that exists so a register cannot be added
unchecked.

## In the OQ record

`OQ-CMC-40` (URS-CMC-028) drives the create refusal, the edit refusal, all four
halves of the ceremony, both preconditions, the signature, and the two refusals
after it:

```
  OQ-CMC-37  pass
  OQ-CMC-38  pass
  OQ-CMC-39  pass
  OQ-CMC-40  pass
OQ-008 CMC / Module 3: 22 pass, 0 fail, 10 deviation, 8 not-executed
```

`ci:validation-traceability` refused the protocol in **both** directions while
this was written — first "describes it; run.mjs does not execute it", then, after
steps 37–40 moved into `steps-attribution.mjs` to keep `steps-registers.mjs`
under its 500-line cap, "run.mjs executes it; OQ-008 does not describe it".

## What is not claimed

- **Studies closed out before 2026-10-19 have no signer.** 202 of the 301 rows
  on this development deployment carry a shelf life; none carries a signature.
  They read as what they are, and no backfill invents one.
- **The shelf life is not re-judged by the ceremony.** The signature refuses
  over no data and over unreadable data; whether *this* claim is supported by
  *that* coverage is the ICH Q1E rule's verdict (URS-CMC-024), which the
  compliance report states separately. The ceremony does not silently approve a
  claim Q1E would fail.
- **One pre-existing client failure is untouched.**
  `cmcRegisterForms.test.ts > analytical methods — maps a filled form onto the
  insert body` fails identically with these changes stashed; it is not this
  slice's and is not claimed as fixed.
