# Existing filing dialog layout review

W1 / D2. This review covers serialized mounted component DOM with the built
CSS, local Chromium at 1440×900 and 390×844, and light/dark themes: eight
layouts across the form and linked receipt. It does not exercise events, the
live authenticated application, web-font delivery or human acceptance.

## What already exists

- `FileToVaultDialog.tsx` already delivers the shared Authoring filing form and
  scoped admission receipt. Its existing result span displayed immutable IDs
  and hashes but could expand beyond the narrow dialog body.
- `journey-v2.css` already supplies the drawer, scrollable body and fixed
  footer. The current shell supplies both the dark class and `data-theme` on
  its wrapper/body; this review uses those existing theme markers.
- The prior component QA convention loads all built CSS in index, V2App, then
  other-chunk order. The structured report pins each stylesheet SHA-256 and
  both captured HTML digests. No alternate UI or stylesheet was created.

## Retained results

`red-layout/` preserves the first eight screenshots and structured metrics.
The form and desktop receipt passed. Both 390px receipt layouts showed a real
horizontal overflow: the body measured 473px scroll width against 366px client
width, clipping long IDs and the SHA-256. Dialog bounds and footer access still
passed.

The result span alone was corrected with `minWidth: 0` and
`overflowWrap: anywhere`. The actual mounted DOM was recaptured from the
corrected source. `component-browser-review.json`, eight screenshots and
`green.raw.log.gz` retain the corrected review: all eight layouts passed page,
dialog-body and text overflow checks; dialog/footer bounds; visible footer
button centers; and the body's ability to scroll to its last content. Both
narrow receipt bodies now measure 366px scroll width against 366px client
width. Their content scrolls vertically while the footer remains visible.

The narrow light/dark receipt screenshots were also inspected with
`view_image`; the IDs/hash wrap and the themes render as expected. The report
pins final dialog source SHA-256
`b20043b53dcce2f018803dbf50c727c0da752b3995520246fa627b0e4d2d91d2`.
Root owns final merged build/compiler/publication qualification.
