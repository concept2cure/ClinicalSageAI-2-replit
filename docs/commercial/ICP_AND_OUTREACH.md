# Ideal customer profile, outreach sequences, demo script, discovery guide and objection handling

> **DRAFT — FOR FOUNDER REVIEW.** Prepared 2026-09-20 by a Claude Code
> session (workstream W6). Everything here describes the Launch Catalog only
> (`shared/constants/launch-scope.ts`). No customer names, testimonials,
> metrics or certifications appear because none exist: the platform has no
> customers yet. Where a claim depends on a launch row that is not yet green
> (`docs/LAUNCH_DEFINITION_OF_DONE.md`) it is phrased conditionally and the
> row is cited. Pricing referenced is the **proposal** in `PRICING.md`, not
> a fact. Launch row moved: **D9** (the conversations it enables move
> **D10**).

---

## 1. Ideal customer profile

### 1.1 Segment A — pre-IND and IND-stage sponsors (primary)

| Attribute | Fit |
|---|---|
| Company | Virtual or early-stage biotech, Series A–C, 5–80 employees, one to three regulatory staff, no RIM system |
| Trigger | Pre-IND meeting scheduled or held; IND target date inside 9 months; first amendment or annual report due; a consultant quote for eCTD publishing in hand |
| Buyer | VP/Director Regulatory Affairs (often also the medical writer and the eCTD troubleshooter); CMO as economic sponsor; QA lead as approver |
| Current tooling | Word, SharePoint or Google Drive, email review, a publishing vendor or consultant for the sequence |
| Budget line | Consulting/publishing project budget ($10–50K per sequence outsourced; $30–80K for a full project — third-party figures in `docs/COMPETITIVE_LANDSCAPE_2026-08.md` §7) |
| What the Launch Catalog gives them | A system of record for the documents that will go into the IND; governed drafting of Module 2 sections with citations; a compiled and validated sequence 0000 before it goes to the publisher or the ESG; controlled SOPs under the same audit trail |
| Disqualifiers | Already on Veeva RIM with publishing; needs EU-hosted data (not available at launch); needs PHI processing before the BAAs exist (**D6**); needs transmission from the platform before **D7** |

### 1.2 Segment B — first-510(k) device sponsors (secondary; scope is narrower)

| Attribute | Fit |
|---|---|
| Company | Device or IVD startup approaching its first 510(k) or De Novo, 5–50 employees, building a QMS for the first time |
| Buyer | Head of RA/QA (one person, usually) |
| What the Launch Catalog gives them | QMS controlled documents (SOPs, quality plans) with Part 11 audit trail and e-signature; Vault for the design-history and technical-file documents; Authoring for the narrative sections; Projects for the submission journey |
| **What it does not give them at launch** | eSTAR assembly, 510(k) section builders, predicate intelligence, GSPR mapping — all "not in this release". Say this in the first conversation. A 510(k) sponsor is a good pilot for the governed-documents half of the product and a wrong pilot for the submission-assembly half |
| Disqualifiers | Wants the eSTAR built in the tool now; already on Greenlight Guru or Qualio with no document-authoring pain |

### 1.3 Segment C — boutique regulatory consultancies and medical-writing shops (channel and customer)

| Attribute | Fit |
|---|---|
| Company | 2–25 person regulatory or medical-writing consultancy serving early-stage sponsors; former agency reviewers; eCTD publishing as a service line |
| Buyer | Principal / managing partner; the person whose margin depends on throughput |
| What the Launch Catalog gives them | One governed workspace per client (Projects), client-ready controlled documents, drafting throughput with citations, a validated sequence as a deliverable, and an audit trail they can hand to the client's QA |
| Commercial shape | Consultancy Order Form (MSA §2.1) with named clients; enterprise tier with multi-client workspaces (**proposal**, `PRICING.md` 2.3) |
| Why they matter | Each brings N sponsors; they standardise deliverables on the platform; they are the channel the competitive analysis names (moat item 4) |
| Disqualifiers | Publishing bureau whose product *is* the sequence and who sees the platform as a competitor rather than a tool; firms whose clients contractually forbid AI-assisted drafting |

### 1.4 What "ideal" means for the first ten conversations

The first customer (**D10**) needs: a real program with a governed document
to file into a sequence within 16 weeks; a named regulatory user willing to
be accountable; a budget owner who can sign a $15K pilot without a board
vote; tolerance for a new vendor whose security and validation posture is
published with its gaps; and no requirement the platform cannot meet at
launch (EU hosting, PHI, transmission, eSTAR).

---

## 2. Qualification questions

Ask these in the first call; the answers decide whether to book a demo.

**Timing and program**
1. What is the next thing you have to send to a health authority, and
   when? (IND, amendment, annual report, pre-IND package, 510(k).)
2. Who writes the documents today, and who assembles the sequence?
3. Have you priced that work with a consultant or publisher? What did they
   quote?

**Team and accountability**
4. Who would be the named regulatory user — the person who signs the
   documents in the system?
5. Who in QA would need to approve a new GxP system, and what do they need
   to see? (Validation package, security posture, SOP impact.)

**Fit with what exists at launch**
6. Do you need EU-hosted data or on-prem inference? (If yes: not at
   launch; do not proceed.)
7. Will the documents contain protected health information? (If yes:
   not until the BAAs exist — **D6**; do not proceed with PHI.)
8. Do you need the tool to transmit to the ESG, or is assembling and
   validating the sequence, then transmitting through your own account or
   vendor, acceptable for the pilot? (**D7**.)
9. For device companies: is your near-term need controlled documents and
   authoring, or building the eSTAR? (Only the first is in this release.)

**AI posture**
10. Does your quality system or any client contract restrict AI-assisted
    drafting? Who decides?
11. What would make you distrust a number the tool shows you?

**Commercial**
12. Could you approve a fixed $15K pilot for 90 days, credited toward a
    subscription, without a board decision? Who signs?
13. Would you be willing to be a named design partner, with logo and a
    case study subject to your approval?

Scoring: proceed to demo if 1–4 are concrete, 6–8 are not disqualifying,
and 12 is "yes" or "probably".

---

## 3. Outreach email sequences

Rules: plain text; one ask per email; no claims about customers, metrics,
certifications or approvals; the honest posture is the pitch. Replace
brackets. Send from the founder.

### 3.1 Sequence S — sponsor (pre-IND / IND-stage)

**S1 — Day 0**

Subject: your IND documents before they go to the publisher

[First name],

I'm building Concept2Cure, a governed system of record for regulatory
documents at small sponsors: controlled documents with a Part 11 audit
trail, drafting assistance from Claude that cites its sources, and an eCTD
sequence you can compile and validate yourself before it goes to a
publisher or the gateway.

We have no customers yet. I'm looking for [three] design partners with an
IND or amendment due in the next nine months, for a fixed 90-day pilot with
a fee that credits toward a subscription.

If [company]'s next submission is in that window, would a 20-minute call
next week make sense? I'll show the six applications that are in this
release and tell you what isn't.

[Founder name]
[title, phone]

**S2 — Day 4**

Subject: re: your IND documents before they go to the publisher

[First name],

One specific thing, in case it's useful even if we never talk: the tool
compiles a sequence and runs validation before anything leaves your hands,
and every number in the readiness report comes from a deterministic
checker, not from the model. The model only drafts and explains.

We publish our security posture with its gaps (no SOC 2 yet, no external
pen test yet — both on the launch list). If that's a non-starter for your
QA, I'd rather know now.

Would a call on [day] or [day] work?

[Founder name]

**S3 — Day 10**

Subject: closing the loop

[First name],

I'll stop here. If the timing changes — a consultant quote lands, an
amendment comes due — reply to this and I'll pick it up. If there's a
better person at [company] for regulatory systems, I'd be grateful for the
name.

[Founder name]

### 3.2 Sequence C — consultancy / medical-writing firm

**C1 — Day 0**

Subject: a governed workspace per client, with the sequence as the deliverable

[First name],

Concept2Cure is a system of record for regulatory documents that a small
consultancy can run one workspace per client: controlled documents, Claude
drafting with citations under a Part 11 audit trail, and an eCTD sequence
compiled and validated as the deliverable — with the audit trail you hand
to the client's QA.

I'm looking for one or two firms as design partners for a 90-day paid pilot
on a real client program. No customers yet; the posture, including what we
haven't done, is published.

Worth 20 minutes to see whether it fits how [firm] delivers?

[Founder name]

**C2 — Day 4**

Subject: re: a governed workspace per client

[First name],

The economics I'm testing with consultancies: per-submission pricing (a
fixed fee per sequence, credited toward a platform subscription) rather
than per-seat, so bringing the client's QA into the record doesn't cost a
licence. If that pricing shape is wrong for your practice, I'd like to hear
why before I set it.

[day]/[day] for a call?

[Founder name]

**C3 — Day 10**

Subject: closing the loop

[First name],

Last note. If a client comes to you with an IND or amendment and a thin
budget for publishing, that's the case the pilot is designed around — reply
and I'll set it up. Thanks for reading.

[Founder name]

### 3.3 Sequence W — warm introduction (via a mutual contact)

**W0 — forwardable note to the introducer**

Subject: intro to [target] at [company]?

[Introducer],

Would you be willing to forward the note below to [target]? Short version:
I'm building a governed document and eCTD system for small sponsors, we
have no customers yet, and I'm looking for design partners with an IND or
amendment due in the next nine months. If it's not a fit for them, no harm.

Thank you either way.

[Founder name]

**W1 — the forwardable note**

Subject: Concept2Cure — design partner for your next submission

[Target],

[Introducer] suggested we talk. I'm building Concept2Cure: a system of
record for regulatory documents at small sponsors — controlled documents
with a Part 11 audit trail, Claude drafting that cites its sources, and an
eCTD sequence you compile and validate before it goes anywhere.

I'm looking for [three] design partners for a fixed-fee 90-day pilot on a
real program. We have no customers yet; I'll show you what's in this
release and tell you plainly what isn't (no eSTAR, no EU hosting, no
gateway transmission until FDA's test environment accepts ours).

Twenty minutes next week?

[Founder name]

**W2 — Day 5 after W1, if no reply**

Subject: re: Concept2Cure — design partner for your next submission

[Target],

Following up once. If the next nine months don't hold a submission, tell me
and I'll leave it. If they do, I'll bring the readiness report for a
one-document sequence so you can see what "validated before it leaves your
hands" looks like.

[Founder name]

---

## 4. Fifteen-minute demo script (Launch Catalog only)

Setup: a demo tenant with launch-scope enforcement on; one project; two
controlled documents; one signed Module 2 section; one compiled
one-document sequence 0000 with its validation report. **Nothing in the
demo tenant is fixture data**; everything shown was created through the
product. Say so.

| Min | Show | Say |
|---|---|---|
| 0–1 | Login with email OTP | "Every login takes a second factor. TOTP is available per user." |
| 1–2 | Home rail; Apps catalog with "Not in this release" locks | "Six applications are in this release. Everything else is in the tree behind a flag that is off in production, and the catalog says so — no toggle, no upsell." |
| 2–4 | Projects → the program: journey, filings catalog, tasks | "One workspace per program. The filings catalog is what this submission type will need." |
| 4–6 | Vault → controlled document: version history, audit entries, governed export | "This is the system of record. Every version, every action, in a SHA-256-chained, HMAC-sealed audit trail." |
| 6–9 | Authoring → the Module 2 section: draft with citations; review; reason-for-change; e-signature | "Claude drafts and cites. A named human reviews and signs — server-side password and MFA verification. Nothing becomes a governed record until that happens. The audit entry records the model version." |
| 9–12 | Submission Center → dossier map → compiled sequence 0000 → validation report | "The sequence is compiled and validated here. Every finding comes from a deterministic validator; the model never produces a verdict. Transmission is not in this release until FDA's test environment accepts our transport; today you transmit through your own account or vendor, and the transmittal surface says exactly that." |
| 12–13 | Submission Readiness → readiness verdict; inconsistency findings | "Readiness is a verdict with its inputs shown. If the engine lacks data it says so rather than guessing." |
| 13–14 | QMS controlled documents → an SOP under the same trail | "Your SOPs live under the same audit trail as the submission documents." |
| 14–15 | `SECURITY.md` on screen; validation package folder | "Here is what we have and what we haven't done. No SOC 2, no external pen test yet; validation package exists and is unsigned by an independent reviewer until our launch row for it is met. You'd own your PQ; we give you scripts and a sandbox. Questions?" |

Do not show: any non-launch surface; any forecast, prediction or planner;
any figure the presenter cannot trace to an engine or a document.

---

## 5. Discovery-call guide (30 minutes)

1. **Their submission (8 min).** What, when, who writes, who assembles, who
   approves. Get the date. Get the consultant/publisher quote if one exists.
2. **Their system of record today (5 min).** Where the documents live, how
   review happens, what QA has approved. Ask what they'd have to show an
   inspector about how a document was changed.
3. **Their AI posture (4 min).** Policy, contracts, the QA lead's view. Ask
   question 11 from §2 ("what would make you distrust a number").
4. **Fit statement (5 min).** Say what's in this release and what isn't,
   against their answers. If a disqualifier appears, say so and stop.
5. **The pilot (5 min).** Scope, fee, term, credit, design-partner rights,
   the milestone table (Pilot Agreement Exhibit B). Ask who signs.
6. **Next step (3 min).** Book the demo with the QA lead present, or agree
   that it is not a fit and ask for a referral.

Record verbatim: the submission date, the quote, the named regulatory
user, the signer, and any objection. File in the founder's conversation log
(`docs/evidence/W6/<date>/conversations.md`, customer identity redacted
unless they consent).

---

## 6. Objection handling

Each answer is bounded by what the code supports on 2026-09-20.

**"We're going with Veeva (or we're already on Veeva)."**
If they hold Vault RIM with Submissions Publishing and a team to run it,
they are not our customer; say so and ask for a referral to a portfolio
company that isn't. If they are evaluating Veeva Basics-class editions: the
platform is one governed workspace with drafting, review, sequence
compilation and validation in one product with no per-seat fee; the
published packaging research suggests publishing is not in the entry
editions of the incumbent (`docs/commercial/RIM_COMPETITIVE_PACKAGING_
RESEARCH_2026-08-23.md` §2.4 — a moderate-confidence inference, verify
before quoting). We are not a Veeva replacement for an enterprise; we are
the system a two-person regulatory team can run before it needs one.

**"We're looking at an AI authoring startup (Weave, Collate, Peer and
peers)."**
Those tools stop at the eCTD boundary and hand the output to a publisher
(`COMPETITIVE_LANDSCAPE` §2). Ours carries the document from draft, through
governed review and signature, into a compiled and validated sequence under
one audit trail. If drafting quality alone is the buying criterion, the
market leader ships agents on the same models; drafting quality is not the
moat and we do not sell it as one. Governance, validation and the sequence
are.

**"We use Word and SharePoint. It works."**
It works until an inspector asks how a paragraph changed between versions,
or the publisher sends back sixty validation findings the week of the
filing. The pilot is designed to run alongside Word: bring one section and
one SOP, see the audit trail and the validation report, and keep Word for
everything else. If after 90 days you would not file the next sequence in
this, the fee was the cost of finding out and it credits toward nothing.

**"Validating a new GxP system is a burden we can't take on."**
Agreed, and we do not hide it. What we carry: the validation master plan,
IQ, OQ with executed automated tests, traceability matrix generated from
the tests, risk analysis and summary report; release notes and IQ/OQ
evidence per release; change control under a documented release policy.
What you carry: your PQ/UAT, SOPs and training, with our test scripts and
a sandbox. Today the package is unsigned by an independent qualified
reviewer (launch row **D4**); it will be signed by the founder and one
qualified contractor before we call ourselves launched, and we will tell
you the date. If your QA needs the signed package before a pilot, we can
wait for it.

**"AI in regulatory documents is a risk."**
It is, which is why the design keeps the model away from anything a
regulator would rely on. Figures, verdicts, validation results and
readiness come from deterministic engines. The model drafts, frames and
explains, with citations. A named human reviews and signs before anything
becomes a governed record, and the audit trail records the model version
behind the draft so you can answer an agency question from your own
records. Every model we can route to is pinned, with a rationale and an
evaluation reference, in an approved-models registry we will show you;
only the primary model and its validated fallbacks serve high-risk
regulatory drafting. Our AI subprocessor's terms do not permit training on
your data. We do not yet hold a zero-data-retention agreement or a BAA with
that subprocessor (launch row **D6**); until we do, we will not accept PHI.

**"You're one person. What happens if you get hit by a bus?"**
The honest answer: that is a real risk and it is stated in our support
policy as a single point of failure, with a named backup contact. What
reduces it: your data is exportable at any time in native formats plus a
tenant export and an audit-trail export with an offline-verifiable
attestation, and the export drill is part of onboarding, so you can leave
in an afternoon. Infrastructure is code (Terraform, CI/CD) on a public
cloud, not on a laptop. The pilot agreement caps your exposure at the pilot
fee and refunds it pro rata if we terminate. [Founder: add source-code
escrow if you are willing to offer it; do not claim it otherwise.]

**"Can you send it to the FDA for us?"**
Not in this release. The platform compiles and validates the sequence and
records the transmittal; transmission through our gateway becomes available
only after FDA's test environment accepts our transport (launch row
**D7**). Until then you transmit through your own ESG account or your
publisher, and the product says exactly that on screen. We will not
represent a transmission that did not happen.

**"Do you have customers / references / a case study?"**
No. You would be among the first. That is why the pilot is fixed-fee,
credited, and comes with design-partner rights you approve line by line.
