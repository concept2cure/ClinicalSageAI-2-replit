# AnA's 2.3 Quality Overall Summary is the open program's, from its recorded CMC data

Row **D2**, and CLAUDE.md Rule 2 ("a tool that asks a model for a figure is a
defect"). From the discovery map: `ana-qos-tool-model-supplied-cmc-data` (P0)
and `qos-tool-model-supplied-sources`.

## The defect

`draft_quality_overall_summary_m2_3` required the model to supply
`cmcSources[]`: the specification, stability and batch data, plus the product
names. It composed Module 3 and the QOS from that JSON, never read the
program's `cmc_source_objects`, and returned `engine: 'deterministic'`. Every
figure in the summary was model-authored, and the label said otherwise. It is
in launch scope, classed `read`, and the intelligence-questions engine
describes it as composing "from the program's CMC source objects".

## The fix

- **`server/services/ana/cmc-quality-summary-tool.ts`** (new) takes no CMC data.
  - A call that carries `cmcSources` is refused, naming why, before anything is
    read.
  - The program comes from the conversation (`resolveOpenProgram`), never from
    input.
  - The sources are the program's own `cmc_source_objects`, composed by
    `composeProjectModule3`, the engine the Module 3 compile uses. The product
    names come from those records.
  - With no program open, no recorded data, or a failed read, the tool says so
    and composes nothing. A failed read is a failure, with the driver's message
    kept out of what the model sees.
- The tool definition (`bla-biologics-tool-defs.ts`) has an empty input schema
  and says it takes no figures.
- The old handler is deleted from `AnaToolExecutor.ts`. The new one is
  registered through the injected-register pattern, and the
  authorization-register entry points at it.

## Red, then green

The registered-handler test was run on trunk's `AnaToolExecutor.ts` and tool
definition (`red-on-trunk.txt`):

```
× draft_quality_overall_summary_m2_3 handler › refuses CMC data supplied in the call, rather than composing from it
  → .toMatch() expects to receive a string, but got undefined   (it composed)
```

After the fix, `cmc-quality-summary-tool.test.ts` has 5 tests:

- supplied data is refused before any read;
- the QOS is composed from the open program's sources, read with
  `[organization, program]`;
- no program open says so;
- no recorded data says so;
- a failed read is a failure.

With the registration, authorization, launch-scope and selection suites:
119/119. tsc is clean on the staged change alone.
