# Regulatory control map — United States, Japan, European Union

**Audited commit:** `adbf2d18` (2026-09-24). **Source of truth for status:** `SECURITY_AUDIT_2026-09-24.md`
(finding ids) and the code paths named there; `docs/validation/TM-001-TRACEABILITY-MATRIX.md` for the Part 11
requirements already traced to tests. **Plan items:** `REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`.

How to read a row: **Status** is what is true at the audited commit. *verified* = built and shown by a test, gate or
reproduction; *partial* = built with a named gap; *absent* = nothing implements it and nothing is planned but the
plan item in the last column; *unverifiable here* = needs the deployed environment. A clause with no control is
written as absent, never omitted. The Japan and EU tables are derived by mapping each Part 11 control to its
counterpart and listing the deltas, so one control can be traced through all three regimes.

Citations to Japanese statutes use the numbering after the 2022 renumbering of the APPI; **counsel is to confirm
article numbers and the current text of the PMDA ER/ES Guideline and the MHLW/METI cloud guidelines at signature.**
EU instruments are cited by their Official Journal number; the 2025 draft revision of Annex 11 is a watch item, not
a requirement, until adopted.

---

## 1. United States

### 1.1 21 CFR Part 11 — Electronic records; electronic signatures

| Clause | Requirement | Control as built | Evidence | Status | Finding | Plan |
|---|---|---|---|---|---|---|
| 11.10(a) | Validation of systems for accuracy, reliability, consistent intended performance | VMP-001, URS ×6, RA-001, IQ-001, OQ-001…006 executed locally; TM-001 generated from the runs; VSR-001 §1–17 | `docs/validation/`, `docs/evidence/W3/2026-09-23c/` | partial: executed locally, not on staging or by a second qualified person; unsigned | — | D4 (founder + contractor signatures); P1-1 adds the idle-logoff OQ step |
| 11.10(b) | Accurate and complete copies in human-readable and electronic form | Signed audit export; tenant full export; document export with signature manifest | `signedAuditExport.ts`; `tenant-full-export.service.ts`; `docs/evidence/DOCUMENT-FIDELITY/` | partial: the signed export reads `audit_events` only, not the store launch apps write | DP-11 | P1-19 |
| 11.10(c) | Protection of records for accurate, ready retrieval throughout retention | Immutability triggers on four stores; append-only grants on `audit.tamper_proof_log`; 35-day RDS backups; object-locked evidence bucket | §5 of the audit | partial: runtime role can delete `audit_logs` with a session setting; no retention clock; no external chain anchor | DP-04, DP-20, DP-15, DP-16 | P0-15, P1-22, P1-24 |
| 11.10(d) | System access limited to authorized individuals | Default-deny `/api` boundary + unconditional gate; token class checks; membership re-check; RLS | `authBoundary.ts`; `tokenType.ts`; `orgMembership.ts` | partial: `/ana` socket admits pre-MFA tokens; connector tokens unscoped; SAML/SCIM not tenant-bound; `warn` honoured in production | IAM-01, IAM-02, IAM-03, IAM-05, IAM-16 | P0-1, P0-2, P0-3, P0-5, P0-8 |
| 11.10(e) | Secure, computer-generated, time-stamped audit trails; not obscuring prior entries; retained as long as the record | Per-tenant sealed chain; atomic audit on launch-path writes; 133 best-effort sites baselined; two disjoint stores; monitor off in production config | `chain.ts`; `auditService.ts`; `startup/audit-trail.ts` | partial | DP-06, DP-11, DP-12, DP-13, DP-14, DP-18, DP-25 | P0-16, P1-19, P1-20, P1-26 |
| 11.10(f) | Operational system checks to enforce permitted sequencing | Governed lifecycle gates (freeze, sign, release); QMS effective only by signature at head | `submission-sign-release.ts`; `mdx-qms.ts:474-491` | verified for the launch paths | DP-01 closed | — |
| 11.10(g) | Authority checks: only authorized individuals use the system, sign, access the operation | Signing authority policy; `requireRole`; but role read from a stale JWT on some routes; AnA cannot sign at head | `signing-authority.ts`; `middleware/auth.ts:203-211` | partial | IAM-10, DP-02 | P1-4, P0-19 |
| 11.10(h) | Device (terminal) checks | None (no device binding, no IP allow-list at login; SCIM IP allow-list exists for provisioning only) | `scim-ip-allowlist-*` tests | absent for user sessions | — | P2 enhancement: optional per-tenant IP allow-list and device attestation (plan P3-2 backlog) |
| 11.10(i) | Persons who develop, maintain or use the system have the education, training and experience | Single operator; no training record | `POLICY-IS-001 §2` | absent | INF-07 (governance) | P1-13 (training record starts with the tabletop) |
| 11.10(j) | Written policies holding individuals accountable for actions under their electronic signatures | No user acknowledgement or accountability attestation | audit §4.2 | absent | DP-22 | P1-21 |
| 11.10(k) | Controls over system documentation: distribution, access, change control, revision history | Policies in git with revision tables; documents unsigned; branch unprotected | `docs/security/policies/`; INF-01 | partial | INF-01 | P0-9 |
| 11.30 | Open systems: encryption and digital signatures as appropriate | TLS at the edge (Terraform); KMS RSA release signature (code, unexecuted); HMAC seals | `alb/main.tf:27`; `payload-signer.ts` | partial: unapplied; e-signature hashes unkeyed | DP-05 | P2-10 |
| 11.50 | Signature manifestation: printed name, date/time, meaning, in the record and its human-readable form | `electronic_signatures` carries all three; manifest verifies hashes; meaning may be null on the governed sign; SCIM can rename the printed name globally | `signature-persistence.ts:673-688`; `docs/evidence/DOCUMENT-FIDELITY/` | partial | DP-17, IAM-05 | P1-21, P0-5 |
| 11.70 | Signature/record linking: cannot be excised, copied or transferred | Content digest + binding basis; supersession; trigger; but revocation refused by the trigger; second stores mutable | `signature-persistence.ts:286-362,867-875` | partial | DP-03, DP-16 | P0-14, P1-24 |
| 11.100(a) | Each signature unique to one individual, not reused or reassigned | Signer resolved from account; `authoring_signatures` keyed by e-mail | `resolve-signer-identity.ts`; DP-16 | partial | DP-16 | P1-24 |
| 11.100(b) | Identity verified before establishing or sanctioning a signature | Signup issues an admin token with no e-mail verification; no identity-proofing record | `routes/auth.ts:991-1029` | absent | IAM-17, DP-22 | P1-2, P1-21 |
| 11.100(c) | Certification to FDA that signatures are the legally binding equivalent | Organisation-level letter (founder); no per-user acknowledgement flow | — | absent (letter is a founder action) | DP-22 | P1-21; founder letter |
| 11.200(a)(1) | Two distinct components (id + password) or biometrics; first signing in a session uses both | `reverifySigner` requires password + enrolled factor; the id comes from the session, not entered; 23 writers skip it | `reverify-signer.ts:100-290` | partial | DP-02 | P0-19; question 6 |
| 11.200(a)(2)(3) | Used only by genuine owners; collaboration of two or more needed to misuse | Account lockout (racy); TOTP enrolment per user; no org-mandatory MFA | IAM-08, IAM-09 | partial | IAM-08, IAM-09 | P1-2, P1-3 |
| 11.300(a) | Uniqueness of each combined id and password | Unique e-mail per user | `users` | verified | — | — |
| 11.300(b) | Periodic checks, recalls or revisions of id/password issuances | Password aging not enforced; `mustChangePassword` advisory; no access reviews | IAM-17; AC-002 §4 | absent | IAM-17 | P1-2, access-review procedure (P1-13) |
| 11.300(c) | Loss-management procedures to deauthorize lost or compromised tokens | Revocation memory 24 h vs 7-day refresh; logout does not revoke refresh; no session versioning | IAM-04 | partial | IAM-04, IAM-02 | P0-4, P0-2 |
| 11.300(d) | Transaction safeguards against unauthorized use; immediate and urgent detection and reporting | Lockout (racy); rate limits per task; no alerting | IAM-09, INF-06 | partial | IAM-09, INF-06 | P1-3, P1-10 |
| 11.300(e) | Initial and periodic testing of tokens or cards | Not applicable (no hardware tokens); TOTP devices not periodically re-verified | — | n/a / absent | — | — |

Related FDA guidance: *Electronic Systems, Electronic Records, and Electronic Signatures in Clinical Investigations:
Questions and Answers* (final, October 2024) — audit-trail and access-control expectations for sponsors' systems
match the rows above; *Computer Software Assurance for Production and Quality System Software* (final, 2025) — the
risk-based validation approach already adopted by VMP-001; *Data Integrity and Compliance With Drug CGMP* (2018) Q7
— audit-trail review (DP-21, P1-25).

### 1.2 HIPAA Security Rule (45 CFR Part 164, Subpart C) and Breach Notification (Subpart D)

Applies only when a tenant places PHI in the platform (the DPA §4 forbids it until BAAs exist). The rows state the
posture a covered entity's assessment would find today. The January 2025 proposed rule (NPRM) items are adopted as
design targets in the plan because a buyer's questionnaire already asks for them.

| Clause | Requirement | Control as built | Status | Finding | Plan |
|---|---|---|---|---|---|
| 164.308(a)(1) | Security management: risk analysis, risk management, sanction policy, activity review | Point-in-time audits; no recurring risk register; no activity review (no alerting, monitor off) | partial | INF-05, INF-06, DP-06 | P1-10, P0-16, P1-13 |
| 164.308(a)(2) | Assigned security responsibility | Founder is the named officer | verified (single person) | — | founder |
| 164.308(a)(3)(4) | Workforce security; information access management | RBAC; membership re-check; SCIM; role from stale JWT on some routes | partial | IAM-10, IAM-05 | P1-4, P0-5 |
| 164.308(a)(5) | Security awareness and training; log-in monitoring; password management | No training record; login failures not alerted; composition-only passwords | partial | IAM-17, INF-06 | P1-2, P1-10, P1-13 |
| 164.308(a)(6) | Security incident procedures | IR-004 drafted; contradicts DPA; no tabletop; no log | partial | INF-07 | P1-13 |
| 164.308(a)(7) | Contingency plan: backup, DR, emergency mode, testing | RDS backups (Terraform); synthetic restore proof; no production rehearsal; single region | partial | INF-15 | P1-16 |
| 164.308(a)(8) | Periodic technical and non-technical evaluation | This audit; weekly review now has a security lens (`security-auditor`) | partial (first run) | — | P1-18 |
| 164.308(b) / 164.314 | Business associate contracts | BAA templates referenced; none signed (Anthropic, AWS) | absent | DP-07 | P2-7 |
| 164.310 | Physical safeguards | AWS responsibility; no workstation policy | partial | — | P1-13 (policy) |
| 164.312(a)(1) | Access control: unique user id, emergency access, automatic logoff, encryption/decryption | Unique ids; automatic logoff: server-enforced idle window (15 min default, tenant-set) and 12-hour lifetime since 2026-09-26 (P1-1); the client's warning timer follows; field encryption only for secrets; cross-tenant file read by name | partial | IAM-06, IAM-07, DP-23 | P1-1, P0-6, P2-7 |
| 164.312(b) | Audit controls | Chained stores; monitor off in production config; `pgaudit` not loaded; no access logs | partial | DP-06, INF-13, INF-05 | P0-16, P1-11, P1-10 |
| 164.312(c) | Integrity controls | HMAC seals; runtime role can delete `audit_logs` via a setting; owner credential in the API task | partial | DP-04, DP-05 | P0-15, P2-10 |
| 164.312(d) | Person or entity authentication | Password + emailed code or TOTP; pre-MFA token admitted on `/ana` | partial | IAM-01, IAM-08 | P0-1, P1-2 |
| 164.312(e) | Transmission security | TLS at the edge (unapplied); no security headers on the SPA document | partial | INF-04 | P0-10 |
| 164.316 | Policies, procedures, documentation; six-year retention | Policies in git; unsigned | partial | — | founder signatures |
| 164.410 | Breach notification by a business associate to the covered entity: without unreasonable delay, no later than 60 days | Not written down | absent | INF-07 | P1-13 |
| NPRM (2025) targets | Mandatory MFA; encryption at rest and in transit; asset inventory and network map; 72-hour restoration; annual compliance audit; vulnerability scans every 6 months; annual penetration test; segmentation | MFA not org-mandatory; no inventory or map; RTO unmeasured; no pen test; scans ad hoc | absent to partial | IAM-08, INF-15, INF-05 | P1-2, P1-15, P1-16, P2-7 |

### 1.3 Cross-cutting US frameworks used as the control vocabulary

| Framework | Use in this map | Where the platform stands |
|---|---|---|
| NIST CSF 2.0 (Govern, Identify, Protect, Detect, Respond, Recover) | Family labels on INF findings; SOC 2 / ISO mapping | Protect is strong; Govern is drafted and unsigned; Detect and Respond are the weakest functions (INF-05, INF-06, INF-07) |
| NIST SP 800-53 rev 5 | Control ids on INF findings (AC-6, AU-2/6/12, CM-3/6/7, CP-4/9/10, IA-5, IR-4/6/8, RA-5, SA-11, SC-7/8/12/28, SI-4, SR-3/4/11) | see §4.3 of the audit |
| NIST SP 800-63B | Authenticator assurance: e-mail is not an out-of-band authenticator at AAL2; TOTP is | IAM-08 |
| ICH E6(R3) §4 data governance (computerised systems: validation, security, audit trail, user management, backup) | Sponsor-facing expectation for eTMF/authoring systems; adopted by FDA and EMA in 2025 | same rows as 11.10(a)(c)(d)(e) |
| SOC 2 Trust Services Criteria | Policy set is keyed to CC/A/C/P criteria; no observation window | P3-1 |

---

## 2. Japan

### 2.1 PMDA / MHLW ER/ES Guideline (2005; *Guideline on the use of electromagnetic records and electronic signatures for applications for approval or licensing of drugs*)

The guideline's three properties of an electronic record — **真正性 (authenticity), 見読性 (legibility), 保存性
(preservation)** — and its electronic-signature requirements map onto Part 11 as follows. Where Japan asks for
something Part 11 does not state explicitly, the row says so.

| ER/ES requirement | Part 11 counterpart | Control as built | Status | Finding | Plan |
|---|---|---|---|---|---|
| 真正性: access limited to authorised persons; creation, change and deletion attributable; audit trail | 11.10(d)(e) | as 11.10(d)(e) above | partial | IAM-01…05, DP-04, DP-06 | P0-1…P0-5, P0-15, P0-16 |
| 真正性: system validation and change control for the record system | 11.10(a)(k) | VMP/IQ/OQ local; branch unprotected | partial | INF-01 | P0-9, D4 |
| 真正性: backup and restoration procedures that preserve authenticity | 11.10(c) | RDS backups; synthetic restore only; verifier after restore is a documented step | partial | INF-15 | P1-16 |
| 見読性: records displayable and printable in human-readable form throughout retention, including audit trail | 11.10(b) | Document export with manifest; signed audit export covers one store; no Japanese-language export requirement, but PMDA reviewers expect legible exports in the submission language | partial | DP-11 | P1-19 |
| 見読性: media/format migration without loss | 11.10(c) | PDF/A toolchain in the image (W2); vault versioning; no migration procedure | partial | — | P2-3 (procedure) |
| 保存性: records retained for the statutory period, protected against loss and unauthorised change | 11.10(c) | Immutability with the DP-04 bypass; no retention clock; no legal hold API; no external anchor | partial | DP-04, DP-20 | P0-15, P1-22 |
| 保存性: retention of the audit trail with the record | 11.10(e) | Same as records by design; no archive procedure that keeps the chain verifiable | partial | DP-04 (archive breaks the verifier) | P0-15 |
| Electronic signature: identifies the signatory uniquely; linked to the record; not reusable; date/time and meaning shown | 11.50, 11.70, 11.100 | as those rows | partial | DP-02, DP-03, DP-16, DP-17 | P0-14, P0-19, P1-21, P1-24 |
| Electronic signature: identity confirmed before issuing signing credentials; management of ids and passwords; periodic review | 11.100(b), 11.300 | no proofing record; no aging; no review | absent | IAM-17 | P1-2, P1-21 |
| SOPs, training and responsibility for the system | 11.10(i)(j) | policies unsigned; no training record; no accountability attestation | absent | DP-22 | P1-13, P1-21 |
| Open-system security (encryption, digital signature where records leave the closed system) | 11.30 | TLS edge; eCTD transport AS2 over TLS without PKCS#7 (GA runbook B5); KMS release signature unexecuted | partial | — | D7 lane; P2-10 |

Related: the MHLW *Guideline on computerised systems for pharmaceutical manufacturers and importers* (2010) applies
the same validation, change-control and audit-trail expectations to GMP/QMS systems; the QMS controlled-documents
app falls under it for a Japanese MAH. No row above changes for it. **Deliverable:** P2-3 generates a clause-by-clause
ER/ES map from TM-001 and lists these deltas, in Japanese and English, for a PMDA-facing buyer.

### 2.2 APPI — Act on the Protection of Personal Information (as amended, article numbers after the 2022 renumbering)

The platform holds personal information of a Japanese sponsor's staff, investigators and signatories and, if a tenant
uploads it, subject-level data. Health information is **要配慮個人情報 (special-care-required personal information,
Art. 2(3))**. A foreign operator handling personal information of persons in Japan is within scope (extraterritorial
application, Art. 166).

| Article | Requirement | Control as built | Status | Finding | Plan |
|---|---|---|---|---|---|
| Art. 23 | Security control measures (安全管理措置) proportionate to risk | The technical posture in the audit; no documented organisational, human, physical and technical measures in the PPC's four categories | partial | — | P2-3 (measures statement) |
| Art. 24 | Supervision of employees | Single operator; no training record | absent | — | P1-13 |
| Art. 25 | Supervision of trustees (委託先: AWS, Anthropic, OpenAI, Sentry, SMTP) | Sub-processor lists disagree; no vendor security review on file; OpenAI reachable by default for embeddings | partial | INF-21, DP-07 | P1-14, P0-17, P2-3 |
| Art. 26 | Breach reporting to the PPC (prompt preliminary report; confirmed report within 30 days, 60 for malicious acts) and notification of data subjects, for leaks of special-care information, financial loss, malicious acts, or over 1,000 persons | Not written down | absent | INF-07 | P1-13 (one notification matrix) |
| Art. 27 | Third-party provision requires consent or a legal basis; opt-out not available for special-care information | Processing is on the controller's instruction (trustee, Art. 27(5)(i)); documented in the DPA | verified as drafted | — | counsel |
| Art. 28 | Cross-border transfer: consent with information on the destination country's regime, an "equivalent" country (the US is not one), or a trustee that maintains equivalent standards under binding contract, with ongoing supervision | Hosting and model inference in the US; DPA has SCC placeholders for the EU only; no Japan-specific transfer clause or information notice | absent | INF-21 | P2-1 (Japan region option), P2-3 (Art. 28 clause and notice text) |
| Arts. 29–30 | Records of third-party provision and receipt | No records-of-provision register | absent | — | P2-3 (register shared with GDPR Art. 30) |
| Arts. 33–35 | Disclosure, correction, suspension of use on the data subject's request | `gdprComplianceService` DSAR types exist; export covers four legacy tables; erasure unsafe | partial | DP-19 | P2-9 |
| Arts. 41–43 | Pseudonymised and anonymised information regimes | De-identified submission content is the default posture (DPA); no formal classification of pseudonymised datasets | absent | — | P2-3 (classification) |

### 2.3 Cloud vendors handling medical information (MHLW *Guidelines for the Security Management of Medical Information Systems* v6 and the METI/MIC *Guidelines for Providers of Information Systems and Services Handling Medical Information* — the "three-ministry, two-guideline" set)

In scope only if a tenant is a medical institution or the platform processes 医療情報 (patient medical information)
on its behalf. Pharmaceutical sponsors' regulatory content is normally outside it. Listed so the boundary is stated.

| Theme | Expectation of the provider | Status | Plan |
|---|---|---|---|
| Responsibility split and risk assessment agreed with the institution | Written shared-responsibility model and risk assessment | absent | P2-3 (only if such a tenant is accepted) |
| Location of data and disclosure of processing outside Japan | Data location disclosed; consent for overseas processing | absent (US only) | P2-1, P2-3 |
| Access logs retained and reviewable by the institution | Access logging with tenant-readable review | partial (audit export; no access logs at the edge) | P1-10, P1-19 |
| Incident reporting to the institution | Timeline agreed | absent | P1-13 |
| Return and deletion of data at exit | Tenant export and purge exist; purge audit row missing; coverage partial | partial | P1-23 |

---

## 3. European Union

### 3.1 EudraLex Volume 4, Annex 11 — Computerised Systems (2011), read with the EMA *Guideline on computerised systems and electronic data in clinical trials* (2023)

| § | Requirement | Control as built | Status | Finding | Plan |
|---|---|---|---|---|---|
| 1 | Risk management throughout the lifecycle | RA-001 (ISO 14971-shaped); no recurring security risk register | partial | — | P1-13 |
| 2 | Personnel: cooperation, qualifications, responsibilities | Single operator | partial | — | founder |
| 3 | Suppliers and service providers: formal agreements, audits, assessment of the supplier's QMS | Sub-processor lists disagree; no vendor reviews; the tenant's own supplier assessment of Concept2Cure has no pack | partial | INF-21 | P1-14, P2-4 (supplier assessment pack) |
| 4 | Validation: documented, risk-based, covering the lifecycle; inventory; URS; test evidence; data migration | VMP/URS/RA/IQ/OQ/TM/VSR drafted and executed locally; unsigned | partial | — | D4 |
| 5 | Data: checks on interfaces for correct and secure exchange | eCTD transport typed refusals; AS2 without PKCS#7 | partial | — | D7 lane |
| 6 | Accuracy checks for critical manually-entered data | Deterministic engines produce figures; model narrates (Rule 2) | verified as design | DP-29 | — |
| 7.1 | Data secured against damage by physical and electronic means; accessibility, readability and accuracy checked | Immutability with the DP-04 bypass; no external anchor; evidence artifacts only in GitHub | partial | DP-04, INF-19 | P0-15, P1-12 |
| 7.2 | Regular backups; integrity and accuracy of backups and the ability to restore checked periodically | RDS backups (Terraform); synthetic restore proof; no production rehearsal | partial | INF-15 | P1-16 |
| 8 | Printouts: clear printed copies; for records supporting batch release, indication of changes | Document export with manifest and signature block | partial (audit export coverage) | DP-11 | P1-19 |
| 9 | Audit trails: record of all GMP-relevant changes and deletions with reason; **regularly reviewed** | Chained stores; reason captured on governed writes; **no review workflow or record** | partial | DP-21, DP-13, DP-14 | P1-25, P1-20 |
| 10 | Change and configuration management: controlled procedure | Single branch, CI gates; branch unprotected, CI non-blocking | partial | INF-01, INF-02 | P0-9, P1-12 |
| 11 | Periodic evaluation to confirm the validated state | This audit; weekly review now has four lenses | partial (first run) | — | P1-18 |
| 12.1 | Physical and logical controls restricting access to authorised persons | as 11.10(d) | partial | IAM-01…05, IAM-16 | P0-1…P0-8 |
| 12.2 | Creation, change and cancellation of access authorisations recorded | Auth events audited; SSO sign-ins not; SCIM writes cross-tenant | partial | IAM-03, IAM-05 | P0-3, P0-5 |
| 12.3 | Management systems for data and documents record the identity of operators entering or confirming critical data | Attribution on governed rows; `old_values` never recorded | partial | DP-13 | P1-19 |
| 12.4 | Record of the identity of operators, date and time (and inactivity logoff by convention) | Inactivity logoff server-enforced since 2026-09-26 (P1-1, idle window and 12-hour lifetime); timestamps from two clocks | partial | IAM-06, DP-25 | P1-1, P1-26 |
| 13 | Incident management: reported, assessed, root cause identified, CAPA | IR-004 drafted; no log; no tabletop; contradictory timelines | partial | INF-07 | P1-13 |
| 14 | Electronic signature: same impact as hand-written within the company; permanently linked to the record; time and date | as 11.50/11.70 | partial | DP-02, DP-03, DP-16, DP-17 | P0-14, P0-19, P1-21 |
| 15 | Batch release by a Qualified Person | not applicable to the launch catalog | n/a | — | — |
| 16 | Business continuity for critical systems | Single region; RTO/RPO unmeasured | partial | INF-15 | P1-16 |
| 17 | Archiving: data checked for accessibility, readability and integrity; archive process validated | No archive procedure that keeps the chain verifiable; retention engine inert; artifacts expire in GitHub | absent | DP-04, DP-20, INF-19 | P0-15, P1-22, P1-12 |
| Draft revision (2025 consultation) | Themes: expanded audit-trail review, security, AI/ML, data integrity, supplier oversight, periodic review | Watch item | — | — | P2-4 tracks the adopted text |

### 3.2 GDPR (Regulation (EU) 2016/679), the platform as processor for EU sponsors

| Article | Requirement | Control as built | Status | Finding | Plan |
|---|---|---|---|---|---|
| 5(1)(c)(e)(f) | Minimisation, storage limitation, integrity and confidentiality | Minimised categories in the DPA; no retention clock; integrity gaps | partial | DP-20, DP-04 | P1-22, P0-15 |
| 17(3)(b) | Erasure exemption for legal-obligation retention (audit trails) | Stated in DPA §3.5; not in the trust statement; erasure paths ignore retention and hold | partial | DP-09, DP-19 | P2-9 |
| 25 | Data protection by design and by default | PII screen on by default; ZDR lane; embeddings outside the gate; browser Sentry replay unscrubbed | partial | DP-07, DP-26 | P0-17, P1-14 |
| 27 | Representative in the Union for a non-EU processor | None | absent | — | P2-2 |
| 28(1)(3) | Processor guarantees; contract terms; sub-processor authorisation and flow-down | DPA drafted; lists disagree; OpenAI reachable by default; Moonshot listed | partial | INF-21, DP-07 | P1-14, P0-17 |
| 30(2) | Processor's records of processing activities | None | absent | — | P2-2 |
| 32 | Security of processing appropriate to the risk | The audit as a whole | partial | all | P0, P1 |
| 33(2) | Processor notifies the controller without undue delay after becoming aware | DPA says [48] h; IR-004 says 72 h to tenants | partial | INF-07 | P1-13 |
| 34 | Communication to data subjects (controller's duty; processor assists) | Assistance clause in DPA §3.3 | drafted | — | counsel |
| 35 | DPIA (processor assists; a DPIA of the AI drafting flow is prudent for the provider's own risk record) | None | absent | — | P2-2 |
| 44–46, 49 | Transfers: SCCs (Module 2/3) + transfer impact assessment, or an adequacy mechanism (EU-US DPF) | Placeholders in DPA Annex IV; no TIA | absent | INF-21 | P2-2 |
| EU/EEA residency (contractual) | Hosting in the Union on request | Single us-east-1 root | absent | — | P2-1 |

### 3.3 EU AI Act (Regulation (EU) 2024/1689), NIS2 (Directive (EU) 2022/2555), Cyber Resilience Act (Regulation (EU) 2024/2847), eIDAS (Regulation (EU) No 910/2014 as amended)

| Instrument | Applicability determination (to be recorded in a memo, P2-5/P2-6) | Status | Plan |
|---|---|---|---|
| AI Act — classification | The drafting assistant is not an Annex III high-risk use (no medical-device, employment, credit or public-service decision); Concept2Cure is a **provider** of an AI system (AnA) and a **deployer** of Claude; Anthropic is the GPAI provider (Art. 53) | memo absent | P2-5 |
| AI Act Art. 50(1) | Persons interacting with an AI system are informed unless obvious — in force since 2 August 2026 | AI-008 disclosure text drafted; first-run in-product notice not shipped | partial | P2-5 |
| AI Act Art. 50(2) | Outputs of systems generating text marked as artificially generated in a machine-readable way, unless editing assistance without substantial modification | Provenance recorded per section; no machine-readable marking on exported AI-drafted text | partial | P2-5 |
| AI Act Art. 4 | AI literacy of staff and deployers | No record | absent | P2-5 |
| AI Act Art. 14 (by analogy, human oversight) | Governed actions require a human signature; model output auto-runs 37 write commands | partial | DP-08 → P0-18 |
| NIS2 Arts. 2, 3 | Cloud computing service providers are Annex I "digital infrastructure" entities subject to the size cap; a company below the medium-size threshold is outside scope; pharmaceutical customers are Annex I health-sector entities and flow down Art. 21(2)(d) supply-chain requirements | out of scope today; customer flow-down applies | P2-6 (memo; SIG-Lite answers the flow-down) |
| NIS2 Art. 23 | Incident reporting (24 h early warning, 72 h notification, 1 month final report) — the customer's obligation the provider must feed | timelines not written down | P1-13 |
| NIS2 Art. 26 | A non-EU provider in scope designates a representative | not triggered today | P2-6 (trigger recorded) |
| Cyber Resilience Act | Applies to products with digital elements; pure SaaS is excluded unless a remote data-processing solution is integral to such a product; the platform and its connector are SaaS | out of scope; watch | P2-6 |
| eIDAS Art. 25 | Electronic signatures are not denied legal effect; a qualified signature equals a handwritten one. Annex 11 §14 does not require AdES/QES. The KMS release signature is a **system seal** (the key is the platform's, not the signer's), so it is not an advanced signature of the individual | stated honestly in SOP-SEC-001 §2a | P3 backlog (per-signer keys) if a tenant's QA asks for AdES |
| European Health Data Space (Regulation (EU) 2025/327) | Secondary-use provisions for health data — relevant only if subject-level data is processed for EU tenants | watch | — |

---

## 4. One control, three regimes — the deltas that matter for a buyer's QA

| Control | US (Part 11 / HIPAA) | Japan (ER/ES / APPI) | EU (Annex 11 / GDPR) | Gap at head | Plan |
|---|---|---|---|---|---|
| Audit trail | 11.10(e) generated, secure, time-stamped | 真正性 + 保存性 with the record | Annex 11 §9 **regularly reviewed** | no review workflow; monitor off; deletable by a setting | P1-25, P0-16, P0-15 |
| Electronic signature | 11.50/11.70/11.200 | signatory identity confirmed before issuance | Annex 11 §14; eIDAS levels optional | 23 writers skip the ceremony; revocation broken; no proofing | P0-19, P0-14, P1-21 |
| Session control | 11.10(d); HIPAA automatic logoff | 真正性 access control | Annex 11 §12.4 | idle logoff and 12-hour lifetime server-enforced (P1-1, 2026-09-26); refresh outlives revocation closed (P0-4) | P1-1, P0-4 |
| Breach notification | HIPAA §164.410 (≤60 days, BA→CE) | APPI Art. 26 (prompt + ≤30/60 days, PPC + subjects) | GDPR 33/34 (processor→controller without undue delay; 72 h to the SA) | three documents, two numbers, no regulator rows | P1-13 |
| Cross-border transfer | — | APPI Art. 28 (consent with country information, or equivalent measures) | GDPR 44–49 (SCCs + TIA, or DPF) | US-only hosting; blank annexes | P2-1, P2-2, P2-3 |
| Sub-processors | HIPAA BAAs | APPI Art. 25 trustee supervision | GDPR 28(2)(4) | lists disagree; OpenAI default for embeddings; no BAAs | P1-14, P0-17, P2-7 |
| Retention and erasure | 11.10(c); predicate rules | 保存性 | Annex 11 §17; GDPR 5(1)(e), 17 | retention engine inert; no hold API; DSAR partial | P1-22, P2-9 |
| Validation | 11.10(a); CSA | ER/ES system validation | Annex 11 §4 | executed locally, unsigned | D4 |
| Change control | 11.10(k) | ER/ES change control | Annex 11 §10 | branch unprotected; CI non-blocking | P0-9, P1-12 |
| AI transparency and oversight | FDA GMLP; NIST AI RMF | (none specific) | AI Act Art. 50 (in force), Art. 4 | notice not shipped; auto-run writes | P2-5, P0-18 |
