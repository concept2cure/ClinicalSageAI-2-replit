# FDA forms framework

The canonical FDA forms implementation is metadata-driven and extends the existing
`FDAFormsRegistry`; consumers must not create a second form catalog. Every registry
entry returned by the API receives a source, lifecycle, PDF, structured-storage,
version, validation-field, and implementation-status contract.

## Implementation tiers

- `metadata` exposes a selectable catalog record but does not imply that the form
  can be safely rendered or submitted.
- `full` is currently reserved for Forms 1571, 1572, 1574, 3454, 3455, 356h, and
  3674. These have deterministic field builders, required-field validation, and
  PDF rendering. An official AcroForm is used when installed; otherwise output is
  conspicuously marked as a draft and must not pass an approval/export gate.

`full` describes application capability, not verification of an FDA edition. A
form remains version `unverified` until its official asset and edition have been
retrieved and reviewed. The API returns the canonical registry definition; routes
must never synthesize a second metadata object.

Form 1572 expands once per investigator. Form 3454 and 3455 are conditional and
mutually governed by investigator financial-interest data. All approved exports
must retain form/version, source provenance, project/tenant, actor, and the
structured field map used to create the PDF.

## Official assets and updates

The FDA catalog at <https://www.fda.gov/about-fda/forms/new-and-updated-fda-forms>
is the authority. Official PDFs are installed once, by canonical form ID, beneath
`templates/forms/acroforms` (or `IND_FORM_TEMPLATES_DIR`). Do not reproduce an
official form in HTML or add duplicate copies elsewhere. Asset acquisition must
record the FDA URL, retrieval time, checksum, edition/expiration text, and license
review; a changed checksum creates a new version rather than overwriting an
approved version.

Every `<FORM_ID>.pdf` requires a sibling `<FORM_ID>.pdf.manifest.json` containing
`formId`, `version`, an HTTPS `sourceUrl` on `fda.gov`, SHA-256, `reviewedBy`,
`reviewedAt`, and a complete `fieldMap` from canonical field IDs to AcroForm field
names. Missing manifests, checksum mismatch, non-FDA sources, or partial mappings
force the renderer back to the watermarked draft path.

Network access to FDA was unavailable during this implementation, so no PDF is
represented as an official downloaded asset in this repository. The renderer
therefore continues to use the fail-safe watermarked draft until reviewed official
assets are installed.

The registry also corrects two legacy collisions: Form 3674 is the
ClinicalTrials.gov compliance certification, not a 510(k) classification form;
Form 3455 is the clinical-investigator financial disclosure, not a device
sterilization form. New form numbers must be checked for an existing canonical ID
before they are added.

## AnA and the canonical editor

The existing `FDAFormGenerator` exposes three AnA adapters—`list_fda_forms`, `prepare_fda_form`, and
`amend_fda_form`—against this same registry. Preparation and amendment emit the
standard `status: generated` artifact envelope, which the AnA stream already
routes into the one Document Studio editor and AnA canvas and persists through
the existing artifact-version store. Amendments require a reason for change and
create a new draft; they never overwrite an approved form version.

All registry forms can be selected and edited as structured drafts. A `full`
form advertises `draftPdfAvailable`; `pdfAvailable` remains false until the
official edition is verified. Metadata-only forms remain editable but must fail
closed at PDF, approval, and submission gates.
These are service contracts only; no FDA-forms UI is implemented here.
