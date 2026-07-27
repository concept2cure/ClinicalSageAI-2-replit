# Pilot Data Agreement

**Concept2Cure.RI / TrialSage — First Human-Testing Pilot**

| | |
| --- | --- |
| **Document ID** | C2C-PILOT-DATA-AGREEMENT-001 |
| **Version** | 1.0 |
| **Effective date** | _______________ (**FILL IN**) |
| **Pilot sponsor** | Concept2Cure, Inc. |

This Agreement governs your participation as a tester in the first human-testing pilot of the Concept2Cure.RI / TrialSage clinical-regulatory platform ("the Platform"). By signing below, you agree to the terms that follow. This is a **pilot** of pre-production software; it is not validated for production regulatory use.

## 1. Permitted data — synthetic and non-confidential only

You will enter **synthetic (fabricated) data only**. You must **not** enter, upload, paste, or otherwise submit:

- any real patient data, protected health information (PHI), or personally identifiable information (PII) of any individual;
- any real, proprietary, or confidential regulatory submissions, trade secrets, or third-party confidential information.

All content you submit must be non-PHI, non-PII, and non-confidential test material created for the purpose of this pilot. You are responsible for ensuring the data you enter meets this requirement.

## 2. What is collected, logged, and audited

To operate the Platform and demonstrate its 21 CFR Part 11-aligned controls, the following are recorded under tamper-evident audit trails:

- **Authentication events** — sign-in, sign-out, session, and access-control activity tied to your tester account.
- **Document edits** — creation and modification of documents and sections, captured as **Part 11-style revision history** (who, what, when, prior/new values) with cryptographic integrity.
- **AI-gateway requests** — prompts, responses, and metadata for AI-assisted features routed through the Platform's AI gateway, retained for audit and evaluation.

These logs are used to operate, secure, debug, and evaluate the pilot.

## 3. Third-party AI processing

AI-assisted features send your input, via the Platform's **AI gateway**, to third-party frontier large-language-model (LLM) providers for processing. These providers may include **Anthropic (Claude)** and **OpenAI (GPT)**, including enterprise cloud-hosted endpoints (e.g., Azure OpenAI Service, AWS Bedrock). Your input is processed by these vendors under their applicable enterprise API terms solely to return a result to you.

Before any content leaves the Platform, the AI gateway enforces **automated PHI/PII screening** on egress, alongside prompt-injection and policy controls. This screening is a safeguard, not a license: it does not relieve you of the Section 1 obligation to submit synthetic data only.

## 4. Data retention and deletion

Pilot data and associated audit logs are retained only for the duration of the pilot and for a limited evaluation window thereafter. **All tester-submitted pilot data will be deleted no later than:**

> **Pilot-data deletion date: _______________  (FILL IN — required)**

Because the Platform enforces Part 11-style immutable, tamper-evident records during the pilot, individual entries generally cannot be selectively erased mid-pilot; deletion occurs as a scoped purge of the pilot dataset on or before the date above.

## 5. Evaluation only; no warranty

The Platform is provided for **evaluation purposes only**, "AS IS" and "AS AVAILABLE," without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, non-infringement, accuracy, or regulatory adequacy. Output must not be relied upon for any real regulatory submission, clinical, or patient-care decision. Pilot software may change, malfunction, or be discontinued without notice.

## 6. Tester acknowledgment

I have read and understand this Agreement. I will submit **synthetic, non-PHI, non-confidential data only**, and I acknowledge the collection, third-party AI processing, retention, and deletion terms above.

| | |
| --- | --- |
| **Tester name (print)** | _________________________________ |
| **Organization / role** | _________________________________ |
| **Signature** | _________________________________ |
| **Date** | _________________________________ |

---

*Concept2Cure, Inc. — Pilot Data Agreement, Document ID C2C-PILOT-DATA-AGREEMENT-001, v1.0. This document covers a non-production pilot and is not a validation, certification, or business-associate agreement.*
