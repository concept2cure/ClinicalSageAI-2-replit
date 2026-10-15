# D4 — AnA's answer grounding checks the regulations it cites

Row **D4**. AnA local-safe-AI plan **WS7** (grounding kinds). Session `…01SuVLo2`,
2026-10-01.

`verifyAnswerGrounding` (`server/services/ana/answer-grounding.ts`) is the deterministic
self-check after AnA's tools run: every trial, literature and FDA-submission identifier
in the answer must appear in the turn's tool evidence, or it is reported unsupported
(advisory, surfaced with the turn). It did not check the regulations an answer cites, so
after tools ran, "21 CFR 820.30(g)" — superseded by the QMSR — or "ICH E9(R1)" cited
from memory read as grounded as anything else.

It now checks:

- **CFR sections**, "<title> CFR <section>" in any common spelling ("21 C.F.R. §
  312.23", "21 CFR Part 11"), both sides put in one spelling, a number not continued
  ("21 CFR 11" is not grounded by "21 CFR 110.10");
- **ICH codes**, after "ICH" or written with their revision ("E9(R1)"); a bare "E2" is
  too common a token to read as a guideline. "ICH E6(R2)" is not grounded by "E6(R3)".

A regulation can be recalled correctly, so a miss means "not supported by this turn's
evidence", not fabricated. FDA guidance titles have no identifier format and are not
checked. No tools run → still a no-op.

| What | Red | Green |
|---|---|---|
| `tests/services/answer-grounding-regulatory.test.ts` | `red/regulatory-grounding.txt`: 4 of 5 fail at the claim commit (no CFR or ICH citation is checked) | `green/regulatory-grounding.txt`: with the existing grounding, agentic-loop and AnA route suites, 187 pass |
