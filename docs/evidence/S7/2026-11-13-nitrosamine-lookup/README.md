# A listed nitrosamine is found by its name or abbreviation, in any case

Plan F1. Completes `server/services/mutagenic-impurity/mutagenic-impurity-knowledge.ts`
(`compoundSpecificNitrosamineAI`).

## What already exists

- The compound-specific acceptable-intake table for nitrosamines (`NITROSAMINE_SPECIFIC_AI`), keyed by abbreviation,
  each entry with its full name, limit and basis. Read by `calculateTTC` and `controlMutagenicImpurity`.
- The impurity register's M7 assessment (`server/services/cmc/impurity-assessment.ts`) passes the impurity's recorded
  name as the nitrosamine identity.
- 2026-10-15 already fixed the text when no entry matches ("No compound-specific AI is on file for …").

## The defect

The lookup upper-cased the identity and tested it against the mixed-case keys. A register row named
"N-Nitrosodimethylamine" got the 18 ng/day default instead of NDMA's 96 ng/day, a false "above" for any level between
the two; `NMPhA` could never match its own key.

## The change

Match the abbreviation or either name the entry holds, ignoring case, hyphens and spaces. The verdict's basis already
names the entry applied. The second half of the mapped candidate (a recorded compound-specific limit for a Class 1
mutagen) needs a column and the held register form; not done here.

## Proof

Red first, one case in
`server/services/mutagenic-impurity/__tests__/m7-classes-alerts-and-limits-as-the-record-holds-them.test.ts`: the
full name "N-Nitrosodimethylamine" got 18, not 96. Then green: "N-Nitrosodimethylamine", "n-nitrosodimethylamine",
"ndma" and "NDMA" each 96 ng/day with the basis "N-Nitrosodimethylamine — 96 ng/day"; "NMPhA" and
"N-Nitrosomethylphenylamine" each find their entry (26.5); "Default" is still not an entry. Mutagenic suite and the
wider CMC suites: 2144 passed. Lint 22/22.

Not walked in the running app: the demo pack records no nitrosamine, and the change is the table lookup the
register's assessment already calls.
