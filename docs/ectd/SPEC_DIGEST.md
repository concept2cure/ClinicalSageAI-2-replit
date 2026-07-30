# eCTD Spec Digest (extracted from FDA/ICH source specs)

Source PDFs (in scratchpad/specs/*.txt): v45_validation (FDA eCTD Validation Criteria v4.5, 2025-10-01),
v40_validation (FDA eCTD v4.0 Validation Criteria v1.5), fileformat_v93 (File Format Types v9.3, 2025-08-20),
techguide_v15 (eCTD v4.0 Technical Conformance Guide v1.5, 2026-06), m1_examples_v14 (Module 1 backbone examples),
m1_addendum_v23 + m1_addendum2_v23, pdf_spec (PDF Specs v4.1), form5640 (Transmitting eCTD Submissions v2.0, 2026-07).
v4.0 controlled vocabulary: scratchpad/ectd4_cv.json (genericode CL1–CL13 + status lists).

## 1. eCTD v3.2.2 (the "3.0" family) — US regional Module 1 backbone

`m1/us/us-regional.xml` (current DTD version **3.3**):
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fda-regional:fda-regional SYSTEM "http://www.accessdata.fda.gov/static/eCTD/us-regional-v3-3.dtd">
<?xml-stylesheet type="text/xsl" href="http://www.accessdata.fda.gov/static/eCTD/us-regional.xsl"?>
<fda-regional:fda-regional dtd-version="3.3" xml:lang="en"
    xmlns:fda-regional="http://www.ich.org/fda" xmlns:xlink="http://www.w3c.org/1999/xlink">
  <admin>
    <applicant-info>
      <applicant-contacts>
        <applicant-contact>
          <applicant-contact-name applicant-contact-type="fdaact1">Jane Smith</applicant-contact-name>
          ... telecom/email ...
        </applicant-contact>
      </applicant-contacts>
    </applicant-info>
    <application-set>
      <application>
        <application-information>
          <application-number application-type="fdaat1">456789</application-number>
        </application-information>
        <submission-information>
          <submission-id submission-type="fdast1">0001</submission-id>
          <sequence-number submission-sub-type="fdasst2">0001</sequence-number>
          <form form-type="fdaft2">
            <leaf ID="..." checksum="<md5>" checksum-type="md5" operation="new"
                  xlink:href="356h-nda456789-0001.pdf" xlink:type="simple">
              <title>Form FDA 356h</title>
            </leaf>
          </form>
        </submission-information>
      </application>
    </application-set>
  </admin>
</fda-regional:fda-regional>
```

### v3.2.2 code prefixes (attribute-coded, NOT genericode)
- applicant-contact-type: `fdaact1`=Regulatory, `fdaact2`=Technical, `fdaact3`=US Agent
- application-type: `fdaat1`=NDA, `fdaat2`=ANDA, `fdaat3`=BLA, `fdaat4`=IND, `fdaat5`=MF, ... (map to CL1)
- submission-type: `fdast1`=Original Application, `fdast2`=Efficacy Supplement, `fdast3`=CMC Supplement, `fdast4`=Labeling Supplement, ... (map to CL12)
- submission-sub-type: `fdasst1..N` (Original / Presubmission / Amendment / Resubmission / Report / Correspondence — map to CL13)
- form-type: `fdaft1`=1571, `fdaft2`=356h, `fdaft3`=3397, `fdaft4`=2252, `fdaft5`=2253, `fdaft7`=3674 ... (map to CL5)

### Package layout (sequence dir NNNN)
```
NNNN/
  index.xml                      (ICH backbone; DOCTYPE util/dtd/ich-ectd-3-2.dtd; dtd-version="3.2")
  index-md5.txt                  (MD5 hex of index.xml)
  util/
    dtd/  ich-ectd-3-2.dtd, us-regional-v3-3.dtd
    style/ ectd-2-0.xsl, us-regional.xsl
  m1/us/us-regional.xml  + m1 leaves
  m2/ ... m5/                    (2-6-2 folder names, e.g. m3/32-body-data/32p-drug-prod/...)
```
Leaf: `<leaf operation="new|replace|delete|append" checksum-type="md5" checksum="..." xlink:href="...">` + `<title>`.
`replace`/`delete`/`append` carry `modified-file="../../nnnn/..."` pointing at the prior leaf (Addendum 1: for grouped
submissions the modified-file path must include the application-type prefix + number, e.g. `../../../../nda456789/0001/...`).

## 2. eCTD v4.0 (HL7 RPS) — single submissionUnit.xml message

- **One `submissionUnit.xml`** message per sequence (HL7 v3 / RPS). Three-element spine: `submissionUnit` → `submission` → `application`.
- Message Header MUST carry the **US Regional IG OID**.
- `submissionUnit`: `id@root`=UUID; `code@code`=submission-unit-type (CL13 `us_submission_unit_type_N`); `code@codeSystem`=OID `2.16.840.1.113883.3.989.5.1.2.2.1.13.2`; `title` (≤128 chars); `statusCode@code="active"`; exactly one `sequenceNumber` (matches NNNN folder).
- `contextOfUse` (replaces the leaf/heading model): `id@root`=UUID; `code@code`=CoU (CL2 `us_1.x`/ICH ctd codes) + `codeSystem` OID; `statusCode@code`=active/suspended; **priorityNumber** (required whole number, one and only one); `documentReference`→document; optional `keyword`(s); `relatedContextOfUse.id@root` references a prior CoU for **lifecycle** (replace/append/delete equivalent).
- `keyword`: `code@code` + `code@codeSystem` OID (e.g. CL3 keyword-definition-type; material-id, issue-date; ICH study-id/study-title).
- `document`/`documentReference`: `id@root`; a document may be **reused** across CoUs (document reuse). Physical files live under the sequence; referenced by title + checksum.
- **Forward Compatibility**: v3.2.2 content can be expressed as v4.0 references (converting prior 3.2.2 leaves into v4.0 CoU/document references) — needed when an application transitions 3.2.2→4.0.
- Controlled vocabularies delivered as OASIS **genericode** (CL1–CL13 + status/telecom lists). OIDs rooted at
  `2.16.840.1.113883.3.989.5.1.2.2.1` (CL1 `.1.4`, CL2 `.2.6`, CL3 `.3.3`, CL5 `.5.6`, CL6 `.6.2`, CL7 `.7.2`, CL8 `.8.3`, CL11 `.11.3`, CL12 `.12.5`, CL13 `.13.2`).

## 3. Validation criteria (severity: High=blocks receipt, Medium=may impact, Low=minor)

### v3.2.2 (v4.5 criteria) — HIGH severity structural (must implement, fail-closed)
- #2 missing `us-regional.xml`; #3 single-file submission; #4 submission contains no files; #5 application type/number
  mismatch between FDA form and us-regional.xml; #6 not in eCTD format; #7 required fillable form (356h/2252/1571) missing.
- MD5: each leaf `checksum` must equal MD5 of the referenced file; `index-md5.txt` must equal MD5 of `index.xml`.
- Leaf operation must be one of new/replace/delete/append (#1034 missing→defaults New, Medium); modified-file must resolve.
- Folder/filename: lowercase, only `a-z0-9-_`, ≤ length limits; correct 2-6-2 module folder names.
- DTD: package self-contained — `util/dtd/*` present; backbone valid against DTD.

### v4.0 (v1.5 criteria) — HIGH severity
- Message well-formed + valid against ICH schema; Header contains US Regional IG OID.
- submissionUnit: id@root is UUID; code@code present + valid for its code system; codeSystem is a valid/known OID;
  exactly one submissionUnit; status requires ≥1 …; exactly one sequenceNumber matching the folder name.
- contextOfUse: id@root is a UUID; statusCode present and =active/suspended; priorityNumber required whole number, one only;
  code system is a valid OID; relatedContextOfUse.id@root must reference an existing CoU.
- keyword/application/document code systems are valid OIDs; document title required (and stable across lifecycle).

## 4. PDF rules (PDF Specs v4.1)
- Versions: PDF 1.4–1.7, PDF/A-1, PDF/A-2. Text-searchable. Readable in Acrobat X w/o plug-ins.
- FORBIDDEN: JavaScript; dynamic content (audio/video/animation/3D); attachments; annotations; security/password
  (exception: promotional labeling material). Hyperlinks must stay active; use relative paths.
- Fonts fully embedded; standard fonts (Times New Roman/Arial/Courier New/Symbol/ZapfDingbats), 9–12pt.
- Page 8.5×11 (A4-safe margins): ≥0.75" left, ≥0.375" other sides. Bookmarks + hyperlinked TOC for docs ≥5 pages.
- File names: lowercase, only hyphen/underscore, no spaces/special chars.

## 5. File formats (v9.3) & locations
- Primary = searchable PDF. `.doc/.docx` allowed M1.14/1.16, M2.3/2.7 (with archive copy where noted). `.xml` many
  locations; `.dtd`→`util/dtd`; `.xsl/.css`→`util/style`. Images `.gif/.jpg/.png` M1–M5. A/V + M&S mostly M5.
- `.zip` only for grouping large aECG XML sets.

## 6. Transmission (Form 5640 v2.0, 2026-07)
- ESG (FDA Electronic Submission Gateway) is preferred and **required** for submissions ≤ 10 GB (NDA, BLA, ANDA,
  commercial IND, master files). > 10 GB → USB physical media to CDER/CBER document rooms (CD/DVD retired).
- Non-compliant transmissions are subject to rejection.

## 7. Regions in scope
FDA (US, above) + EMA (eu-regional.xml, CESP) + PMDA (jp-regional.xml) + Health Canada (ca-regional.xml, needs build).
Each region: own regional DTD/backbone + own validation rule set + own gateway/size limits.
