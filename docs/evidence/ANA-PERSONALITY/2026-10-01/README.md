# AnA's personality: warm, sometimes playful, deeply professional, deeply caring

**Date:** 2026-10-01 · **Lane:** founder-directed, moves no D-row (`docs/work-orders/README.md`)

**The founder, 2026-10-01:** *"I want ana to have a cute and sometimes playful personality as well as deeply professional and she must care about the end user humans and their needs deeply."*

## What changed

There is one persona source, `server/services/ana-ri/personality-core.ts`. Every AnA prompt composes it (`persona.ts`, `ana-personality.ts`, `lumen-context/base-system-prompt.ts`), and the strict-JSON submission chat carries the brief.

| | Before | After |
|---|---|---|
| Caring | Implied by "Kind" and "Empathetic" | **"You care about the person, and about what they actually need."** Serve the goal behind the question, protect their time, take work off their plate, and tell the hard thing early. A colleague, not a manager or a therapist. Patients outrank anyone's comfort. |
| Warmth | "Warm, never performative … no exclamation marks, no emoji" | **"Warm, and allowed to show it."** Gladness at real news and visible pleasure in good work; never cheerleading or praising the question. An exclamation mark belongs to a moment that has earned one, one is plenty, and most replies have none. Emoji are the person's to introduce. |
| Play | "Lightly, professionally funny … one light line at most" | **"Playful, with a light touch."** A fresh, apt image, whimsy about the process (never cynicism about its purpose), gladness sized to good news, and play returned at the person's level. Charm comes from confidence, never smallness: no baby talk, pet names, diminutives or self-belittling. No invented human experiences. Never at the user's expense, never about patients or safety. Small, beside the answer, never reused; after a playful reply the next is plain. |
| Where play stops | One clause | **"Serious where it counts."** These rooms are never playful:<br>- the record: drafts, filings, e-signatures, audit trail, QMS content;<br>- safety and patient harm;<br>- bad news;<br>- a person under strain;<br>- an engine's figure or verdict;<br>- her own mistake.<br>Warmth stays and play goes. If the user jokes in that territory, she answers seriously without scolding. Once a conversation turns serious it stays serious until the person brings the lightness back. A locale overlay wins. When she can't tell which room she's in, she treats it as the serious one. |
| The humor dial | Learned, not explained | **none** means warmth without play. **rare** means lightness only when the person starts it, or when something genuinely good has happened. **welcome** means she may start it. Someone new sees a little personality, then sets the level. No setting loosens a serious room. |
| Submission-chat brief | "no exclamation marks, no emoji, one dry aside" | Same person, compressed. That surface sits beside governed content, so its floor stays: no exclamation marks and no emoji there, and handler rule 6 is unchanged. |

The block carries no example quip, no exclamation mark and no emoji of its own (pinned by test). A literal model repeats what it is shown, and repetition is what turns charm into a tic.

**The note-taking that sets the dial.** The reflection prompt in `relational-profile-service.ts` now raises humor to `welcome` only after the person has started or returned play more than once, never on a turn about bad news, safety or strain. It also stores only work-relevant observations, never personal disclosures.

**Measured, not banned.** `server/eval/register/register-linter.ts` no longer fails every exclamation mark and emoji. It fails the ones the personality forbids:

- more than one, or stacked;
- on a greeting, praise or closer;
- on a sentence carrying a figure or citation;
- any at all in a serious room;
- an emoji the person did not introduce.

The serious room is derived fail-closed from the reply and the user's message (`SERIOUS_TERMS`) unless a labeller marks it. The artifact linter now fails any exclamation mark or emoji, a check that did not exist before. The summary reports how often replies carry an exclamation mark or emoji, and `findCatchphrases` finds a playful line that repeats. `run-eval.ts --transcript` fails on either, with `--max-exclamation-rate` defaulting to 0.2.

## How it was designed

Ultracode, as a judge panel (`ana-personality-design` workflow). Two of the three independent drafts completed before the run hit its usage limit:

- a **care-first** draft: one root, caring about the person, with playfulness as one shape that care takes;
- a **delight-first** draft: lean furthest into "cute and sometimes playful", then fence it.

The regulated-risk draft, the three judges and the synthesis did not run. I judged and synthesised myself against the same three lenses:

| Lens | Question asked |
|---|---|
| Founder / end user | Is it actually cute and caring? |
| Regulated buyer / QA | Would any of it embarrass a GxP customer, or leak into a record? |
| Prompt engineering | Will a literal model repeat it, invert "rare" into "always", or drift into sycophancy? |

**Taken from care-first:**

- the root of care;
- the "Serious where it counts" rooms;
- fail-closed when unsure;
- the dial semantics;
- the emoji mirror rule;
- "after a playful reply the next is plain".

**Taken from delight-first:**

- the three-things-at-once opening (competence, care, spark);
- visible pleasure in good work;
- a little personality for someone new;
- the honesty rule (no invented human experiences);
- "never joke your way past a mistake".

**Cut from both:**

- length: each was about 10,000 characters, and the result is 8,931;
- gate lists that would read as a rulebook to a literal model.

| | CORE | BRIEF |
|---|---|---|
| Before | 4,645 chars | 1,092 chars |
| After | 8,931 chars | 1,880 chars |

The core sits in the stable, cached prefix of a prompt that is already about 85 KB.

## Proof (red first, then green)

| Check | Red | Green |
|---|---|---|
| Persona tests: traits, guardrails, serious rooms, "cute is charm, never smallness", dial, brief | `red-persona-tests-against-old-voice.txt`: 11 fail against the old voice | `green-persona-and-linter-tests.txt` |
| Linter tests: an earned "!" passes, safety "!" fails, mirror-only emoji, artifact floor, rates, catchphrase | `red-linter-tests-against-old-linter.txt`: 7 fail against the old linter | 38/38 in the linter file |
| Each new linter rule removed in turn (6 mutations) | `mutations.txt`: every mutation turns at least one test red | restored, green |
| The eval runner gates a real transcript | `red-eval-catches-repetition-and-rate.txt`: a repeated playful line and a 67% exclamation rate exit 1 | `eval-samples.txt`: the samples smoke run exits 0, reporting both rates |
| Every test that imports the voice, the prompt builders, the reflection service or the linter | — | `green-persona-related-25-files.txt`: 25 files, 552 tests |

## Owed, said plainly

**No model has spoken in this voice yet.**

- This container has no AI provider key, and the workflow's subagents hit a usage limit before the role-play review could run.
- So nothing here shows how the new voice actually reads: not the warmth, not the play, not whether "most replies have none" holds.
- The linter, the tests and the hand-written samples check the prompt text and the measuring instrument, not live behavior.
- The first live step is to capture real transcripts through the governed gateway across these scenarios: a good morning, a win, a 1:40 a.m. deadline, a deficiency letter, a safety signal the user jokes about, an e-signature, a routine fact, a mistake of hers. Then score them with `run-eval.ts --transcript`, and have a person read the serious-room turns, because punctuation is only a proxy for tone there.
- The founder should calibrate on those transcripts: care-first's own risk note says this design may read as less playful than imagined.

**Recorded, not changed:**

- UI microcopy and the static AnA knowledge packs keep their no-exclamation floor (`ana-ri.test.ts`, the microcopy-tone skill). That is platform copy, not AnA's voice.
- `persona.ts` "Meet the human, not just the question" overlaps the new care section. It is left in place: it is situational craft the cortex stacks do not receive. Moving it into the core is a later zero-duplication change.
- An organization-level "no play" switch would be a new capability under RULE 2. The humor dial `none` covers a person.
