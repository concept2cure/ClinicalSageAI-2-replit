# Reading a sequence filed elsewhere: MR-10 Stage 9, slice 1

Launch row **D7** (an IND sequence the platform builds is accepted by the agency).
Ledger package **L1**. Tester blocker **CAT2-07**: a sponsor whose IND sequences
were filed by another publisher cannot replace, append to or withdraw any of them
here. Decided by `…session_01Gx2fiwvxaXi6mQgddPqMaG`, 2026-11-01.

This slice **completes `server/services/legacy-importer/detector.ts`**. It does
that by converging its backbone reader onto one reader of a filed sequence. That
reader produces the record the platform already keeps for its own sequences. It
builds no screen, route, table, migration, AnA tool or mount.

## What already exists

The searches covered the reader, the vocabularies and the receivers. Names
searched:

- import, legacy, filed sequence, prior sequence, backbone, index.xml,
  us-regional, leaf manifest, modified-file, checksum, heading;
- the `legacy-importer`, `ectd`, `submission-gateways` and `archive` folders;
- `server/routes/mdx-imports.ts` and `submission-filed-baseline.ts`;
- the AnA executor;
- migrations naming `ectd_sequences`, `ectd_compilations` and `import_jobs`;
- `git log --all --diff-filter=D` on the same names. No deleted reader or importer
  was found.

| What | Path | What it does today | What it does not do |
|---|---|---|---|
| Legacy archive detector | `server/services/legacy-importer/detector.ts` | Detects an archive's format. It hashes every file and stores each one's placement for review (`import_job_files`), through the REST import (`server/routes/mdx-imports.ts`, refused by launch scope) and AnA's in-scope `start_legacy_import` (`AnaToolExecutor.ts`). | Until this change, its backbone reader (`parseBackboneLeaves`) regex-read the regional backbone only and matched hrefs to zip paths as written. On a real sequence it mapped **no** leaf from a backbone. It reported every Module 1 leaf missing, and it placed every leaf by filename (`docs/evidence/MR-10/2026-11-01-filed-sequence-reader/detector-before-fix.txt`). |
| The record of a filed sequence | `server/services/ectd/sequence-manifest.ts` (`SequenceLeafManifestEntry`, `buildLeafManifest`, `manifestToPriorLeaves`) | Each leaf's section, file, href, md5, act, `modified-file`, title, backbone ID and backbone, as the packager records them when it files a sequence. | Nothing produces it for a sequence the platform did not build. |
| The filed state | `server/services/ectd/prior-sequence-loader.ts` (`foldManifestRows`, `MODIFIED_FILE`, `loadFiledStateBySubmission`) | Folds recorded manifests, oldest first, into what is on file. A replace or delete takes off file the leaf its `modified-file` names (P-42). | Reads only manifests recorded on `ectd_compilations`, so only sequences the platform built. **Held by the RIM lane for F1 slice 1** (`.design/claude-convergence/COORDINATION.md`), so this slice does not edit it. |
| Pointer (`modified-file`) parsers | `regional-packager.ts` `MODIFIED_FILE_NAMES_A_LEAF` (the outbound sink); `prior-sequence-loader.ts` `MODIFIED_FILE` (the fold's binding); `ectd/qualification/qualify.ts` `unresolvedModifiedFiles` (the harness) | Three spellings of one pointer grammar. | None is exported for a reader to use, and the loader's is under RIM's hold. |
| The packager's own record | `server/services/submission-gateways/regional-packager.ts` (`leafManifest`, `leafPackagePath`, `leafElement`, `rebaseToBackbone`) | Writes index.xml and us-regional.xml with checksums, backbone IDs and rebased pointers, and records the manifest. | Write side only. |
| Heading maps (forward) | `ectd-packager/ich-headings.ts` (`ICH_BACKBONE`, `headingPathFor`); `ectd/controlled-vocab/fda-regional-sections.ts` (`usRegionalHeadingPlacement`, whose `encodesSection` already reads a section from an element name) | Section → heading element, for writing. | No reverse map. The ICH tree stops at the DTD's first sub-level (3.2.S.4.2 is written under `m3-2-s-drug-substance`). |
| Outbound package validator | `submission-gateways/ectd-structural-validator.ts` (`rootChecksumErrors`, `leafChecksumErrors`, `LEAF_TAG_RE`) | Checks a package the platform is about to ship by regex: the index-md5 contract and each leaf's checksum. | Produces no manifest. It is a gate on outbound packages, a different capability, and is **not** converged here (see "Adjacent, not converged"). |
| Archive limits, path containment | `server/services/archive/safeZip.ts` (`assertZipWithinLimits`); `server/services/ectd/leaf-path-safety.ts` (`isContainedIn`) | Bound an archive before it inflates (SEC-17); containment test. | Reused as they are. |
| Declared baseline | `ectd/filed-sequence-baseline.ts`, `routes/submission-filed-baseline.ts`, `FiledElsewhereBaseline.tsx` | Lets a person declare the sequences filed elsewhere (numbers and submission types), so the next sequence numbers after them. | Holds no leaf, so nothing filed elsewhere can be replaced or withdrawn. `docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md` lists the full import as Stage 9, "none of it exists"; slice 1 below is its first piece. |
| XML parser | `@xmldom/xmldom` 0.9 (a runtime dependency, used until now only in tests) | Parses without fetching a DTD or expanding an undeclared entity. | Reused. |

## What this slice does

1. **`server/services/legacy-importer/filed-sequence-reader.ts`**, inside the
   folder of the file it completes (RULE 6: split, don't add). It reads every
   sequence in an archive (the root, or each four-digit folder) into
   `SequenceLeafManifestEntry` rows:
   - index.xml, checked against index-md5.txt;
   - the regional backbone index.xml points at, checked against that pointer's
     checksum;
   - every leaf, with:
     - its href resolved against its own backbone's folder and contained in the
       sequence;
     - its MD5 verified;
     - its ID and operation;
     - its `modified-file` re-expressed from the sequence root, as the packager
       records it.
   - **Pointers are checked by resolving them, not by a fourth spelling of the
     grammar.** The reader checks only what any pointer to a leaf must be: it
     leaves its own sequence, names a backbone file and carries one ID. Then:
     - a pointer into another sequence of the same archive must bind to a leaf
       read from that backbone of an earlier sequence;
     - a pointer to a sequence the archive does not hold is listed
       (`outsideArchive`), for the recorded filed state to bind with
       `MODIFIED_FILE`;
     - anything else is refused.
     A withdrawal takes the withdrawn leaf's name and md5, which is what
     `computeLifecycleOperations` records for the platform's own.
2. **A leaf's section is the heading that holds it**, read from the heading's
   element name. ICH and FDA heading names encode their section, which the
   forward maps already rely on. Every heading between the root and the leaf must
   decode, each inside its holder. A Modules 2–5 section must resolve in
   `ICH_BACKBONE`, and a Module 1 section must be at least `1.x`. An element that
   is neither a heading nor a known wrapper (`node-extension`, the FDA admin
   `form`, EU `specific`) is refused by name. Nothing is taken from a folder or a
   filename.
3. **Refusals.** Twenty codes, per leaf or per sequence. A refused leaf is left
   out of `leaves`, so `isComplete(sequence)` is false. Nothing may record an
   incomplete sequence as filed state.
4. **Convergence.** `detector.ts` loses its regex reader and maps a file only
   where the reader declares it. Each refusal becomes an error finding naming the
   file. The application, sequence and applicant come from the regional
   backbone's admin block. The root `index-md5.txt` is recognized as structure.
   The detector's two consumers (the REST import and `start_legacy_import`) are
   unchanged.

## Review round, 2026-11-02

An independent five-lens review confirmed 35 findings. The evidence README's
"Review round" maps each one to what changed. These changes alter the design
above:

- **A leaf may reuse a file from an earlier sequence of its application** (ICH
  file reuse). If the archive holds that sequence, the file's checksum is
  verified there. Otherwise the leaf waits on the filed state.
- **A sequence is complete only when nothing waits on the filed state.** That
  means no pointer and no reused file in a sequence the archive does not hold
  (`outsideArchive`).
- **Every bound pointer is recorded as `../<sequence>/<backbone>#<ID>`.** It
  must name a leaf still on file, in an earlier sequence of the same
  application. A withdrawal takes the withdrawn leaf's section, name and md5.
- **Two leaves of one sequence under one heading with one file name are
  refused** (`leaf_identity_ambiguous`). The fold would have kept one of them.
- **An index.xml that fails its index-md5 check gives no leaves**, as a
  regional backbone that fails its checksum already did.
- **Two new modules, inside the same folder:**
  - `filed-sequence-xml.ts`: decoding, linear entity/DOCTYPE checks, the
    heading tree;
  - `filed-sequence-pointers.ts`: binding pointers, and identity.

A second review, before these were pushed, found more. Its fixes (evidence
README, "Second review"):
- A reused file must be one a kept leaf of the earlier sequence filed.
- An archive zipped without its application folder is read as that folder's
  contents. A grouped-form path (`../../ind123456/0000/…`) must climb through
  the application's own folder. That folder is named by its regional backbone:
  the FDA prefix of the `application-type`, then the `application-number`. A
  path into another application's folder is refused, as a pointer or as a
  reused file: that application's filed state is not this one's (draft review,
  2026-11-02).
- Leaf and pointer IDs must be in the grammar the fold parses.
- The on-file model follows the fold's supersession by section and file name.
- Leaves filed directly in a heading that has sub-headings are read as filed,
  as the ICH DTD allows.

## Known limits, written down

- **Section precision is the backbone's.** A sequence written by this platform's
  packager files 3.2.S.4.2 under `m3-2-s-drug-substance`, so it reads back as
  3.2.S. A publisher that writes the ICH DTD's deeper headings
  (`m3-2-s-4-1-specification`) reads back at that depth. The lifecycle fold keys a
  leaf by `leafKey`, else `section/fileName`, and binds a replace or delete by the
  pointer (sequence, backbone, ID). An imported leaf is therefore acted on through
  its backbone ID (P-42 lineage), never by matching a native section string. That
  binding is step 6 below.
- **Within one sequence, a shared heading and file name is refused** (see the
  review round). Across sequences it is not. A later leaf with the same heading
  and file name as an earlier, different document supersedes it in the fold,
  as a native leaf with the same precise section would. Only keying imported
  leaves by backbone ID in the fold closes this. The fold is in
  `prior-sequence-loader.ts`, held by RIM, and this is handed there.
- **The decoded section is not checked against a list of CTD sections.** That
  list is the ICH DTD, which is not vendored (`assets/ectd-dtd/` holds none, and
  ich.org is unreachable from the build environment). A well-formed name such as
  `m3-2-s-9-x` reads as 3.2.S.9. DTD validation of an imported backbone (Stage 5)
  closes this.
- **Heading attributes are not read.** `m3-2-s-drug-substance` carries `substance`
  and `manufacturer`. Two drug substances therefore read as two 3.2.S headings,
  distinguished by backbone ID only.
- **Not recoverable from a backbone:** `sourceMd5` and `originalPdfProof` (what a
  packager was handed before PDF/A), and `leafKey`.
- **Module 1 outside the US.** EU and JP regional headings that do not encode a
  `1.x` section (`m1-responses`, say) are refused, not mapped.

## Alignment with the other sessions

The coordinating session is `session_01JbQUvBxcGHdBgkgAydQKpx` ("UI and workflow
redesign", ONE_DESIGN_PLAN §4.6), and its file holds are in
`.design/claude-convergence/COORDINATION.md`. This slice touches no held file and
no file a D or S spec names.

`prior-sequence-loader.ts` is RIM's for F1 slice 1. A first draft of this slice
exported `MODIFIED_FILE` and `foldManifestRows` from it. The draft was stopped
before it reached the remote and redone so it needs neither export:

- the reader binds pointers by resolution, as above;
- the round-trip test folds through the already-exported
  `loadFiledStateBySubmission`, with a pool that answers its manifests query.

**Handed to RIM** for when the hold lifts: converge the three pointer parsers onto
one exported rule, and have this reader use it for `outsideArchive` pointers.

## Adjacent, not converged

`ectd-structural-validator.ts` checks the same checksum contract by regex, for
packages the platform ships. It is a gate whose output is error strings, not a
reader whose output is filed state. Converging it onto this reader would change
the export gate, which is Submission Center's (S5). The reader reuses no part of
it, so the contract is now checked in two places. Proposed follow-up: the
validator calls `readFiledSequences` on the zip it validates and maps each refusal
to its error string. That is one change, owned by the S5 lane.

## What remains of Stage 9, and who decides

| Step | Needs |
|---|---|
| 4. A governed act records a complete imported sequence as filed state (e-signature, audit row, idempotent), modelled on `recordFiledSequenceRejection` | Free to build. It collides with the unreleased package-model claim (work-orders README: "Package-model spine…", claimed 2026-09-24, last note 2026-10-21), which holds `package-sequence-lifecycle.ts` and governed transmit. Needs that claim released or the founder's word. |
| 5. Where the record lives: `ectd_compilations` with an imported origin, or `ectd_sequences.origin` | A migration (RULE 1, RULE 5: a table or column change the ledger must approve). Founder decision. |
| 6. Bind a later sequence's replace/append/delete to an imported leaf by its backbone ID | Steps 4 and 5. |
| 7. Where a person starts it: the existing project document start, or Submission Center's existing Builder (`SubmissionSeqWorkspaces.tsx`) | RULE 4: no new card. Vault admission of `.zip` is an open MR-08 founder decision. |
| 8. DTD validation of the imported backbones | The ICH and FDA DTDs vendored (Stage 5, legal sign-off per DTD). |
