# The CMC work area, walked on the small-molecule programme (J5-13, closed)

**Package:** S7 / F1. **Date:** 2026-11-09. Session `session_01GJidg5q1KFNfFT2VZyjcqw`.

J5-13 asked for a demo programme whose Module 3 build the product would show. The data and the composition landed
earlier today; this is the remaining half — **the screens, opened and used**, at 1440 and 390, against the running
app on this container with the demo seeded into the real database.

`walk.json` and `approve-walk.json` are the runs; `screenshots/` holds six screens and the signature refusal.

## What the walk shows

**Overview (`*-01-overview.png`).** The project is open, the board reads *"1 submission — no preparedness index
computed yet"* and the section-approval table lists all 21 §3.2 sections with their completeness and state — 3.1 at
100%, 3.2.A.1 at 50% naming `containerDescription` as missing. No invented figures.

**Module 3 build (`*-02-build.png`).** *"21 sections in CTD §3.2 · 0 of 21 approved · 18 ready to compile · 0 stale
· 0 blocked"*, and the export gate refusing in its own words: *"not export ready — 0 of 21 sections approved · 3
sections with no recorded source lineage"*, with *"Contradictions — Not swept yet — no count is claimed."* A product
that says it has not swept rather than showing a zero.

**Specifications (`*-03-specifications.png`).** Six attributes, each with **its own** procedure and limits — the
table this morning's composer fix is about, here in the register's own surface:

| Attribute | Material | Method | Release | Shelf life |
|---|---|---|---|---|
| C2C-201 tablets — dissolution | Drug product | Dissolution (USP <711>, apparatus 2) | NLT 80 % (Q) released at 30 minutes | NLT 80 % (Q) released at 30 minutes |
| C2C-201 tablets — assay | Drug product | HPLC-UV assay and related substances | 95.0 - 105.0 % of label claim | 93.0 - 107.0 % of label claim |
| C2C-201 — solid form | Drug substance | XRPD identity and polymorph form | Conforms to the Form I reference diffractogram | … |
| C2C-201 — water content | Drug substance | Karl Fischer water determination | NMT 0.5 % w/w | … |
| C2C-201 — specified and total impurities | Drug substance | HPLC-UV assay and related substances | Any specified impurity NMT 0.20 % … | … |
| C2C-201 — assay | Drug substance | HPLC-UV assay and related substances | 98.0 - 102.0 % on the anhydrous basis | … |

No horizontal page scroll at either width; **no console errors** at either width.

## The approval gate, refusing a real signature

`screenshots/1440-04-signature-form.png` and `1440-05-refusal.png`. "Approve" on the dissolution limit opens the
§11.50 signature form; submitting it returns

```
409 {"success":false,"error":"METHOD_NOT_FIT","message":"The analytical method \"Dissolution (USP <711>,
apparatus 2)\" is recorded as validation, which is neither validated nor shown suitable, so a limit measured by it
cannot be approved (ICH Q2). Validate the method, or record the status that shows it is suitable for this use."}
```

and the screen says exactly that, in the server's own words. This is this morning's gate
(`docs/evidence/F1/2026-11-08-specification-method-gate/`) refusing a real approval in the running product, naming
the method and the status the register holds for it.

**Stated precisely, because the distinction matters.** The server refuses *before* `verifyReauth`, so the signer's
password is never verified against a refusal — that is what "nobody signs into a refusal" means and what the route's
tests pin. The form still collects the password before submitting, because the client holds no second copy of the
rule: it cannot know whether a *named* method is fit without reading the method register, and a second copy is how
two surfaces come to disagree. So the honest claim is: **nothing was signed, nothing was verified, and the user was
told why** — not that the form knew in advance.

## Two defects the walk found, both fixed

1. **A doubled full stop.** The refusal reached the user as *"…suitable for this use.."* — the toast appended a
   period to a sentence that already had one. `joinSentence` (`surfaces/cmcSpec.ts`) decides from what the message
   actually ends with: a terminated sentence is left alone, a bare code like `METHOD_NOT_FIT` is terminated, and the
   tail is its own sentence. Five cases in `cmcSpecMapping.test.ts`.
2. **A starter naming an attribute the programme does not have.** The Specifications ask row offered *"Justify the
   release and shelf-life limits for **aggregation**"* — hard-coded, and aggregation is an antibody attribute. On a
   small-molecule programme it offers to justify a limit the project records nothing about. It now names the work:
   *"Justify a release or shelf-life limit on this project."*

Both are visible corrected in the re-walked `1440-05-refusal.png`.

## How it was walked

`scripts/visual-qa/playwright.mjs` resolves the browser; the session is seeded through `/api/auth/dev-login` the way
the login screen's demo path does, and the open programme is put on the URL (`?program=<uuid>`) and in the shell's
own per-tab channel. The scripts live in the session scratchpad rather than the repository: they drive a running
server with a seeded database, which is not a committed check, and the repository already holds the two
general-purpose sweeps (`scripts/visual-qa/`) that are.

## Gates

`tsc --noEmit` 0 errors. ESLint: `CmcModule.tsx` 13 warnings before and after, `cmcSpec.ts` none. The 23 client
suites that touch either file: **321 tests pass.**
