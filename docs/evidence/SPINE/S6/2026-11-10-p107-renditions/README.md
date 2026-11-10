# The converter does not request what a Word file links to (2026-11-10)

Package F1 (repairs). Found while giving Vault versions a PDF rendition (P-107 item 3).

**The rendition itself is not this folder's.** Another session landed it on trunk first
(`server/services/vault/vault-rendition.ts`, `ed9f5d36d`, `b5bb39ce8`; evidence in
`docs/evidence/SPINE/S6/2026-11-10/`). This lane had built its own copy at the same time and withdrew it before it
reached trunk (`e2c4162ec`), so one implementation stands. What this lane keeps is the repair below, which trunk's
rendition needs.

## The defect

`convertDocxToPdf` (`server/services/pdf-converter.ts`) starts LibreOffice on a Word file. Until renditions, every
file it was given had been built by the platform. A rendition gives it a file someone uploaded.

A Word file can name content outside itself. `04-linked-content-probe.txt` measures what LibreOffice 24.2 does with
that, started with the converter's own flags against a listener on the loopback address: a picture linked through an
external relationship was requested over HTTP during the conversion, also when the relationship was declared a
hyperlink, and also when its `TargetMode` was written with a character reference. So an uploaded Word file could
make the server call an address inside its own network.

## What already exists

- `runLibreOffice` in `pdf-converter.ts`: one LibreOffice process per conversion, with a fresh profile directory per
  run (`-env:UserInstallation=`), a conversion slot and a timeout. The profile was empty.
- LibreOffice's own setting for this, `BlockUntrustedRefererLinks` (Security/Scripting): linked content named by a
  document outside a trusted location is not loaded.
- The converter's callers, found with `grep -rn "pdf-converter\|convertDocxToPdf" server`: the authoring exports, the
  reporting PDFs, the eCTD rendering, and now the Vault's rendition.

No caller checked a Word file for links, and no setting was written.

## What changed

`pdf-converter.ts` writes `BlockUntrustedRefererLinks=true` into `user/registrymodifications.xcu` of the profile it
makes for each run, before LibreOffice starts, and does not start it when the profile cannot be written. Every
conversion is covered, whoever asks for it.

## Evidence

| File | What it shows |
|---|---|
| `04-linked-content-probe.txt` | Seven probes of what LibreOffice requests while converting hand-written Word files, and that it requests nothing with the setting in the profile. |
| `05-converter-red.txt` | `server/services/__tests__/pdf-converter.linked-content.real.test.ts` on trunk's converter: it called the listener, for an image relationship and for one declared a hyperlink. |
| `06-converter-green.txt` | The same test after the change: nothing requested, and the PDF is still written. |

The test runs the real converter where LibreOffice is installed and skips the two conversions where it is not; the
profile's content is asserted everywhere. The converter's other suites are unchanged by it: 19 files, 274 tests pass.
Two files (9 tests: the authoring export integration and the reporting PDF identity) fail the same way with trunk's
converter in this container, because the reporting PDF fonts are not installed here.

## What is not done

- **One layer.** The Vault's rendition (`vault-rendition.ts`) hands an uploaded Word file to the converter with no
  check of its own, so this setting is the only thing between an upload and a request. The withdrawn copy also
  refused a Word file whose relationship parts name anything outside the file. That refuses ordinary web links too,
  which most real documents hold, so it was not carried over. Whether to add a second layer, and which (refuse
  linked pictures and objects but not hyperlinks; or convert a copy with its link targets taken out), is a security
  decision for the coordinator and the rendition's owner.
- **Not verified:** other ways a file could make LibreOffice call out that the probe did not try; what the deployed
  task can reach on its network; that the deployed image's LibreOffice honours the setting (the test proves 24.2).
  LibreOffice parsing uploaded files deserves a security review before renditions reach customers.
