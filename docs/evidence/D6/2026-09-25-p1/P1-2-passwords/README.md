# P1-2 (fourth part) — a chosen password is checked against the commonly used ones and the account's own words (IAM-17)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-17 ("no breached-password screening").
**Plan item:** P1-2, the last engineering part.

## What was wrong

The policy checked length and composition and a regex of eight words. NIST SP 800-63B §5.1.1.2 asks that a chosen
secret be compared against values known to be commonly used, expected or compromised, and against context-specific
words (the user name, the service name). Composition rules make people decorate a common word rather than choose a
different one, so `Password1234!` passed.

## What is true now

- **A bundled list** (`server/data/common-passwords.txt`: the ten thousand most common passwords and the
  twelve-character-or-longer entries of the NCSC hundred-thousand list, 11,197 entries, redistributed through
  SecLists under MIT) is compared with the chosen password bare and behind its decorations (leading and trailing
  digits and punctuation removed; punctuation removed throughout). Nothing leaves the process.
- **Context words**: the address's local part, the person's name and the organisation's name (tokens of four
  characters or more) and the product's names may not appear in the password. Every caller passes what it knows:
  sign-up (address, name, organisation), first-user setup (the same), password change (the session's address),
  password reset (the account the token names, checked once the token has proved it).
- `validatePasswordPolicy(password, context)` keeps every rule it had; the two new refusals read
  "Password is too common…" and "Password must not contain your name, e-mail address or organisation."

## Not in this commit

A breach-corpus lookup (a k-anonymity range query against a third party) is a founder decision: it sends five hex
characters of a SHA-1 to an outside service on every password change. The bundled list is the "commonly used"
half of the requirement; the "compromised" half waits on that decision (work-order board hand-off).

## Evidence

- `red/before-fix.txt` — the new test against the previous code: the module does not exist.
- `green/after-fix.txt` — the test after the change, with the sign-up, reset and setup route suites.
