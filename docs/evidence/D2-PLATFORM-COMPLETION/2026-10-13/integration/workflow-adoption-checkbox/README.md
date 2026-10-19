# Workflow adoption and signature-meaning style follow-up

The mandatory V2 undefined-class gate failed on `es-field` and `es-field-hint` in AuthoringFilingBar. Those shared signing-dialog field styles also treated this checkbox as a full-width text input. The existing bar now uses narrowly scoped V2 adoption wrapper, label and hint classes in the existing authoring stylesheet. Consent text, checked/disabled state, revision and meaning reset, event handlers, eligibility and signing requests are unchanged. No gate baseline changed.

Actual dialog inspection also found that the V2 root button reset outranked the shared meaning-pill rule: Authorship, Review and Approval had zero padding and 19.5px height. The same existing V2 stylesheet now restores the canonical shared padding, borders, type, hover/selected colors and keyboard ring. Desktop pills keep their shared 30px appearance; the existing mobile breakpoint gives them a 44px minimum. No selection or signing logic changed.

The exact class gate was observed red and then green. The final 26 existing filing/adoption and shared signing posture/open-reset tests passed. Scoped ESLint reported zero warnings/errors, and diff-check was clean. Two final source digests are recorded.

Actual authenticated Chromium inspected the existing Review ceremony on the synthetic saved CSR working copy on 2026-10-14. Each context changed meaning Authorship→Review, verified selected aria/color state and 2px keyboard focus on a meaning pill, then cancelled and reopened the ceremony. Consent stayed unchecked, its checkbox retained zero text-field padding and a 44px label target, and the qualification/assignment boundary remained visible. Credentials stayed empty; no signing or regulated mutation was sent; document, source, revision, span and audit state remained exact. Existing background collaboration presence traffic is recorded separately in each browser JSON. Signer name/email are masked during screenshot capture; controls and content were not edited.

| Context | Body width | Checkbox | Consent label height | Meaning pill height | Consent contrast | Hint contrast |
|---|---:|---:|---:|---:|---:|---:|
| light | 1440 | 16×16 | 44 | 30 | 10.34:1 | 5.21:1 |
| dark | 1440 | 16×16 | 44 | 30 | 12.12:1 | 6.82:1 |
| mobile | 390 | 16×16 | 44 | 44 | 10.34:1 | 5.21:1 |

All three contexts had zero API, console and page failures. `meaning-controls-before.json` records the actual pre-repair zero-padding measurements. Earlier final workflow, figure/provenance, DOCX and saved-conversation evidence remains separate in `../browser-final/`.
