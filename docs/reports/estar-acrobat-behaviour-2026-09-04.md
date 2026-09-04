# What Acrobat does with the eSTAR we file — 2026-09-04

**Scope.** The vendored official FDA template `assets/estar-templates/eSTAR-510k-non-ivd.pdf`
(nIVD eSTAR v7.0), which the `510k-device`, `de_novo-device` and `pma-device` descriptors
all address. Everything below was measured from that file's own XFA packets.
**Acrobat itself was not run** — it is not installed in this environment — so every
statement about Acrobat is labelled either *declared by the template* (measured) or
*inferred from XFA event semantics* (marked as inference).

**Method.** The XFA packets were decrypted and inflated with the production module's own
`listXfaPackets` (`server/services/forms/fill-official-pdf.ts`); no second decryptor was
written. Sizes: `config` 3,163 B · `template` 9,877,094 B · `localeSet` 2,860 B ·
`datasets` 17,408 B · `xdp:xdp` 162 B · `form` 30,983 B.

**Before any structural scan, the body of every `<script>` and `<exData>` element was
blanked** and replaced with a token — 1,434 script bodies with content (plus one empty
self-closing `<script/>` = 1,435 script elements) and 434 exData bodies. This is not a
formality: the JavaScript inside those bodies contains `<` and `>` that forge XML tags.
Blanking removes **2,999 spurious elements** (75,429 → 72,430). A scan run *without*
blanking reports that **all twelve** container subforms are revealed by no script at all —
the exact opposite of the truth. That failure is reproduced on demand in
`estar-field-map.template-behaviour.test.ts` (see "Verification" below). All structural
counts here come from the blanked copy; all quoted script text comes from the unblanked
bodies, with the template's own XML escaping (`&amp;&amp;`) left intact.

---

## 1. The answer, in one paragraph

A client who opens our filed eSTAR in Acrobat sees **page 1 of a form that looks blank**.
Their 20 values are in the file and correctly bound, but the twelve subforms that contain
them are hidden, and **nothing in the template unhides them when the document opens**.
The applicant must click the Application/Submission Type radio on page 1 themselves. When
they do, the sections appear and **16 of the 20 values are there** — and the same click
silently blanks the other **4**, because FDA's form derives those four cells from source
fields we do not fill.

---

## 2. Why the form opens looking blank

### 2.1 There is exactly one on-open script, and it reveals nothing

Across the whole 9.88 MB template packet:

| event | count | what they are |
|---|---|---|
| `<event activity="initialize">` | **1** | on `root` |
| `<event activity="docReady" ref="$host">` | 2 (one with an empty self-closing `<script/>`) | bookmark pane |
| `<event activity="ready" ref="$layout">` | 2 | page numbering |
| events with `ref="$form"` | **0** | — |
| `<event activity="change">` | 88 | user edits |
| `<event activity="click">` | 735 | user clicks |
| `<event activity="exit">` | 461 | user leaves a field |

Script parents: 1,322 under `<event>`, 107 under `<variables>` (named `Functions`
libraries — declarations only), 5 under `<validate>`, **0 under `<calculate>`**.

The single `initialize` script (7,699 bytes, on `root`) makes **zero**
`presence = "visible"` assignments and contains **zero** `execEvent` calls. Its only
presence work is hiding instruction blocks:

```
//be sure expanded instructions are hidden
ApplicationType.USA.ATTextK.presence = "hidden";
ApplicationType.USA.ATTextK2.presence = "hidden";
...
AdministrativeDocumentation.TextUF.presence = "hidden";
```

The `docReady` script is, in full:

```
event.target.viewState = {overViewMode:3}; // Show bookmark pane
```

The two `ready` scripts are `this.rawValue = xfa.layout.page(this);` and
`this.rawValue = xfa.layout.pageCount();`.

There is no `<restoreState>`, `<preserve>` or `<exclude>` anywhere in `config` or
`template`. The `config` packet declares `<renderPolicy>client</renderPolicy>`,
`<scriptModel>XFA</scriptModel>`, `<interactive>1</interactive>`,
`<dynamicRender>required</dynamicRender>`.

### 2.2 Every reveal hangs off a user action

Enumerating every `X.presence = "visible"` assignment (1,631 of them) and attributing each
to the event that owns it, for the twelve containers that hold our 20 fields:

| container | revealed by | activity |
|---|---|---|
| `AdministrativeInformation` | `ApplicationType.USA.ATRadioButton110`, `…IMDRF.ATRadioButton010`, `…CDN.ATRadioButton120` | `change` |
| `ApplicantInformation` | `ATRadioButton110`, `ATRadioButton010` | `change` |
| `CorrespondentInformation` | the three region/pathway radios; `Verification.ImportData` | `change`, `click` |
| `AdministrativeDocumentation` | the three region/pathway radios | `change` |
| `Classification` | `ATRadioButton110`, `ATRadioButton114` | `change` |
| `USAKnownClassification` | `ATRadioButton110` **only** | `change` |
| `PredicatesSE` | `ATRadioButton110`, `ATRadioButton114` | `change` |
| `PMNSummary` | `AdministrativeDocumentation.ADDropDownList890` **only** | `exit` |
| `DoC` | `AdministrativeInformation.Standards` `<variables>` `AutoPopulate()` **only** | (called from `change`) |
| `Labeling` | four radios + `Cybersecurity.CSDropDownList412` | `change`, `exit` |
| `SpecificLabeling` | `ATRadioButton110`; `LBPresence()` | `change` |
| `PredicateReference` | `PredicatesSE.PredicateReference.AddPredicate` **only** | `click` |

**Zero** of them is an `initialize`, `docReady` or `ready` script. `change`, `exit` and
`click` are user-interaction activities; XFA does not fire them when a data packet is
bound at load. *(That last sentence is the one inference in this section; §2.3 shows the
script could not complete even if some engine did fire it.)*

### 2.3 The deciding script cannot run without a focused widget

`root.ApplicationType.USA.ATRadioButton110`, `<event activity="change">`, 42,145 bytes —
the only script that reveals `Classification`, `Classification.USAKnownClassification` and
`PredicatesSE`. Its FDA-region reveal block opens:

```
	//Unhide subforms and questions present in all FDA premarket types
	if (xfa.host.getFocus().name.substr(0,15) != "ATRadioButton10" &amp;&amp; ApplicationType.ATRadioButton100.rawValue == 1){//only run if the region radiobutton didn't call this, and if FDA (since Import would run this otherwise)	
		CoverLetter.presence = "visible";
		AdministrativeInformation.presence = "visible";
		AdministrativeInformation.ApplicantInformation.presence = "visible";
		...
		Labeling.SpecificLabeling.presence = "visible";
		...
	}//if
```

and its 510(k) branch:

```
	if (this.rawValue == "1"){ //510(k)
		...
		Classification.presence = "visible";
		Classification.USAKnownClassification.presence = "visible";
		PredicatesSE.presence = "visible";
		...
	}//if
```

`xfa.host.getFocus()` is dereferenced **unconditionally**. FDA's own comment elsewhere in
the template states when it is null — in `Classification.USAKnownClassification.DDDropDownList513`
`<event activity="exit">`:

```
if (xfa.host.getFocus() != null) {//if something is focused, which won't happen on an exit
```

With no focused widget the expression throws before any `presence` assignment runs. So even
an engine that fired `change` at bind time could not complete the reveal.

### 2.4 FDA's own data-loading path is a button, not a binding

`root.Amendment.Verification.ImportData`, `<event activity="click">`:

```
		xfa.host.importData()
		
		if (xfa.form.root.ApplicationType.ApplicationSubType.ATRadioButton130.rawValue != null) {//base whether the import was successful on whether the application subtype is null
		...
			//cycle through each subform and field and run the exit and change routine
			for (var i = 0; i &lt; xfa.form.root.nodes.length; i++) {
				if (xfa.form.root.nodes.item(i).className === "subform" &amp;&amp; xfa.form.root.nodes.item(i).presence == "visible") {
					...
							xfa.form.root.nodes.item(i).nodes.item(j).execEvent("change");
							xfa.form.root.nodes.item(i).nodes.item(j).execEvent("exit");
```

FDA wrote a button that **manually replays** `change` and `exit` on every field in every
*visible* subform after importing an XML data file. That replay would be pointless if data
binding fired those events by itself. It is corroborating evidence for §2.2, and it is why
the change handlers are littered with `if (xfa.host.getFocus().name != "ImportData")`
guards. Note it recurses only into subforms already `visible` — which is why the pathway
radio, sitting inside the always-visible `ApplicationType`, is the entry point for the
whole cascade.

---

## 3. What the client must do, step by step

1. **Open the file in Adobe Acrobat Pro.** The template's own `initialize` script warns on
   `app.viewerType == "Reader"`, and `ImportData` refuses to run under FoxIt / PDF-XChange.
2. **Page 1 will show only the Application/Submission Type questions.** Jurisdiction is
   already set to *US FDA* — that is FDA's own default in the shipped datasets skeleton
   (`<ATRadioButton100>1</ATRadioButton100>`), not something we wrote.
3. **Click the pathway radio: "Premarket Notification 510(k)".** FDA ships this group
   empty (`<ATRadioButton110/>`). This click is the one action that reveals the form.
4. The sections appear. **Verify §4 before doing anything else** — four cells will be blank
   that were filled a moment earlier.
5. **Do not click the region/jurisdiction radio afterwards.** Its `change` handler contains
   `this.USA.ATRadioButton110.ATRadioButton111.rawValue = null;` (and `112`, `113`) under
   `if (xfa.host.getFocus().name != "ImportData")` — i.e. exactly when a human clicks it.

---

## 4. The four values the reveal click itself destroys

This is the finding that matters most, and it is independent of the pathway question.

**Twelve of the twenty mapped `510k-device` fields are auto-populated summary cells**, not
places an applicant types. An FDA script clears each (`X.rawValue = "";`) and rebuilds it
from a *source* field elsewhere in the form. The table below was enumerated by searching all
1,435 script bodies for an assignment to each mapped leaf field's `rawValue`; it is checked
into `estar-field-map.ts` as `ESTAR_TEMPLATE_RECOMPUTED_FIELDS` and re-derived on every test
run.

| canonical key | recomputed by | rebuilt from | do we fill the source? |
|---|---|---|---|
| `deviceTradeName` | `DeviceDescription.Devices <variables>` | `Device[].TradeName` | **no → blanked** |
| `deviceClassificationName` | `DDDropDownList517 [exit]` | `DDDropDownList517` | **no → blanked** |
| `productCodes` | `DDDropDownList517 [exit]`, `DDTextField517a [exit]` | `DDDropDownList517` | **no → blanked** |
| `declarationDeviceTradeName` | `DeviceDescription.Devices <variables>` | `Device[].TradeName` | **no → blanked** |
| `deviceCommonName` | `DDDropDownList513 [exit]` | `DDDropDownList513` | no |
| `regulationNumber` | `DDDropDownList513 [exit]` | `DDDropDownList513` | no |
| `applicantContactTelephone` | `ApplicantInformation <variables>` | `ADTextField170` | no |
| `correspondentTelephone` | `CorrespondentInformation <variables>` | `ADTextField370` | no |
| `declarationCompanyAddress` | `ApplicantInformation <variables>` | `ADTextField220…270` | no |
| `applicantSummaryEmail` | `ApplicantInformation <variables>` | `ADTextField160` | **yes → reproduced** |
| `correspondentSummaryEmail` | `CorrespondentInformation <variables>` | `ADTextField360` | **yes → reproduced** |
| `declarationCompanyName` | `ApplicantInformation <variables>` | `ADTextField210` | **yes → reproduced** |
| `predicateSubmissionNumber` | `DeletePredicate [click]` only | — | n/a (explicit delete) |
| `predicateDeviceTradeName` | `DeletePredicate [click]` only | — | n/a (explicit delete) |
| `associatedProductCodes`, `applicantCompanyName`, `applicantContactEmail`, `correspondentCompanyName`, `correspondentContactEmail`, `indicationsForUseCitation` | **never assigned by any script** | — | durable |

**The first four rows are cleared by the pathway click itself.** The 510(k) branch of the
`ATRadioButton110` change handler ends with:

```
		Classification.USAKnownClassification.DDDropDownList517.execEvent("exit"); //controls class III summary form
		AdministrativeDocumentation.ADDropDownList870.execEvent("exit"); //TA statement
		AdministrativeDocumentation.ADDropDownList890.execEvent("exit"); //510(k) summary
		DeviceDescription.ComponentsAccessories.DDDropDownList430.execEvent("exit"); //component
```

and, further down,

```
		DeviceDescription.Devices.Functions.Validation(); //run for device name
```

`DDDropDownList517`'s exit handler begins:

```
AdministrativeDocumentation.PMNSummary.SSTextField260.rawValue = ""; //default summary field
AdministrativeDocumentation.PMNSummary.SSTextField240.rawValue = "";	
```

and `DeviceDescription.Devices`'s `Validation()` begins:

```
function Validation() {
	//Declarations
	var Incomplete = true; //false if any trade name is not blank
	var Devices = ""; //string of device names

	//Defaults
	AdministrativeDocumentation.DoC.DCTextField140.rawValue = "";
	AdministrativeDocumentation.PMNSummary.SSTextField220.rawValue = "";
```

Both then rebuild from sources we do not fill (`DDDropDownList517` is empty on a blank FDA
form; the `Device[]` repeat has no trade name), so the rebuild leaves them blank. Net:
`deviceTradeName`, `deviceClassificationName`, `productCodes` and `declarationDeviceTradeName`
are `""` from the moment the applicant reveals the form.

The remaining recomputed fields survive the reveal click but are blanked the moment the
applicant touches their source control — e.g. selecting the classification in
`DDDropDownList513` clears `deviceCommonName` and `regulationNumber` and rewrites them from
the dropdown; tabbing through any applicant field runs `ApplicantInformation.Validation()`
and blanks `declarationCompanyAddress` and `applicantContactTelephone`.

**This is a product decision that is still open**, and nothing here changes behaviour: we
either keep filling summary cells knowing FDA's form owns them, or we map the *source*
fields (`Device[].TradeName`, `DDDropDownList513/517`, `ADTextField170/220…270`,
`ADTextField370`) and let FDA's own scripts populate the summaries — which is what the form
is built to do. That second option needs its own investigation (the classification dropdown
is a coded item list, not free text) and is not attempted here.

---

## 5. The question that was asked: should the fill write the submission-type radio?

**No. Nothing was implemented.** The radio *is* writable — the exclusion group
`root.ApplicationType.USA.ATRadioButton110` has no `<bind>` child (default binding), is
present in the datasets skeleton, and pdf.js binds and renders a value written to it
(`fill-official-pdf.xfa-render.test.ts`). Item on-values, read from the template's own
`<items>`: `1` = 510(k), `2` = De Novo, `3` = PMA. It is withheld for four reasons, in this
order:

1. **It reveals nothing** (§2.1–2.2). No on-open script reads it.
2. **The one script that would reveal the sections cannot run without focus** (§2.3).
3. **It would consume the affordance that does work.** FDA ships the group empty, so the
   applicant sees an unanswered radio and clicks it — and that click is what reveals the
   form. Writing the value pre-answers the question *without running its handler*, leaving
   the file in a state no click produces: pathway shown as chosen, every section still
   hidden, and no obvious control left for the applicant to operate. Whether Acrobat fires
   `change` when a user re-clicks an already-selected exclusion-group member is **not
   observed here**; but in the favourable case writing gains nothing (the user must click
   either way), and in the unfavourable case it strands the form. The asymmetry decides it
   without needing Acrobat.
4. **It is the applicant's declaration.** Which pathway a submission is filed under is a
   regulatory assertion made to FDA. Nobody re-reads a radio button they never chose.

And it would not even be durable: one click on the jurisdiction radio nulls it (§3 step 5).

---

## 6. What changed

| file | change |
|---|---|
| `server/services/pathway-engines/estar/estar-field-map.ts` | Rewrote the `WHY THERE IS NO submissionType KEY` block with the measured reasons above, replacing the previous note that called the mechanism "unverified". Added `ESTAR_TEMPLATE_RECOMPUTED_FIELDS` + `EstarRecomputedField` — the enumerated record of which mapped fields the form recomputes, from what, and which four the pathway click clears. |
| `server/services/pathway-engines/estar/__tests__/estar-field-map.template-behaviour.test.ts` | **New.** Re-derives all of §2 and §4 from the vendored template on every run, with the blanking pass built in. Also asserts no field map writes any `root.ApplicationType.*` path. |
| `docs/reports/estar-acrobat-behaviour-2026-09-04.md` | This report. |

No behaviour changed. No field map gained or lost a mapping. `estar-administrative-data.ts`
was not modified: no new key needed a governed source.

### Verification — the checks were made to fail first

| break | result |
|---|---|
| Added `submissionType: { xfaSomPath: 'root.ApplicationType.USA.ATRadioButton110', … }` to `510k-device` | 3 failed / 6 passed. `AssertionError: 510k-device.submissionType must not write the applicant's pathway declaration: expected 'root.ApplicationType.USA.ATRadioButto…' not to match /^root\.ApplicationType\b/` |
| Falsely declared `productCodes` durable (`writtenBy: []`) | 1 failed / 8 passed. `- "productCodes": [] / + "productCodes": [ …` |
| Disabled the script/exData blanking pass | 6 failed / 3 passed, including `expected [ 'AdministrativeInformation', …(11) ] to deeply equal [ 'PredicateReference' ]` — an unblanked scan finds **no** revealing script for any of the twelve containers, the exact forged-tag error the blanking exists to prevent. |

Both files were restored byte-identical afterwards (`md5sum -c`: OK, OK).

---

## 7. Still unobserved

- **Acrobat has not been run.** Everything above is what the template *declares*. The step
  from "only `change`/`exit`/`click` handlers reveal these sections" to "Acrobat will not
  reveal them on open" is an inference from XFA event semantics, supported by FDA's own
  `ImportData` replay loop (§2.4) and its `getFocus() != null //…won't happen on an exit`
  comment (§2.3).
- **Whether Acrobat fires `change` when a user re-clicks an already-selected radio.** Not
  needed for the decision (§5.3), but it is the difference between "harmless" and
  "stranding" for a hypothetical future write.
- **Whether Acrobat prefers the saved `form` packet over a datasets write.** For the 20
  mapped fields this cannot arise: the `form` packet (30,983 B, object 270) declares **no
  node** for any of them — searched by leaf name, 0 hits each. It *does* carry
  `<field name="ATRadioButton101"><value><text>1</text></value></field>` for the
  jurisdiction group's member, and no node for `ATRadioButton110`.
- **The IVD template** `eSTAR-510k-ivd.pdf` was not scanned. Its `ApplicationType` logic is
  probably identical; that is an assumption, not a measurement. The test file covers the
  nIVD template only.
- **A reveal written through a fully computed node name** would have escaped the scan.
  None was seen, and `execInitialize`, `execCalculate`, `execValidate`, `setInstances` and
  `execEvent("initialize")` all appear **0** times in the template.
