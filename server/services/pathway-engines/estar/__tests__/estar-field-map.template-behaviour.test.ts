/**
 * WO-8 — the FDA template's OWN script text, asserted, so the field map's
 * claims about Acrobat cannot rot.
 *
 * `estar-field-map.ts` withholds a `submissionType` key and warns that twelve of
 * the twenty `510k-device` fields are summary cells the form recomputes. Both
 * claims are statements about a 9.88 MB vendored binary, and a comment about a
 * binary is a rumour. This file re-derives them from the template on every run:
 * it decrypts and inflates the XFA packets with the production module's own
 * `listXfaPackets` (no second decryptor), BLANKS the body of every `<script>`
 * and `<exData>` element before any structural scan — their JavaScript contains
 * `<` and `>` that forge tags, ~3,000 spurious elements' worth — and then reads
 * the event graph off the blanked copy and the script text off the unblanked
 * bodies.
 *
 * WHAT IT PINS
 *  1. The template declares exactly one `initialize` event, and it neither
 *     reveals a section nor calls `execEvent`. No `ref="$form"` event exists.
 *  2. Every script that makes a mapped field's container visible hangs off a
 *     USER-INTERACTION activity (`change` / `click` / `exit`) — never
 *     `initialize`, `docReady` or `ready`. This is why a datasets write cannot
 *     make the filed form show its sections, and why no `submissionType` key
 *     is mapped.
 *  3. The one script that reveals the 510(k) sections dereferences
 *     `xfa.host.getFocus()` unconditionally, so it cannot complete with no
 *     focused widget.
 *  4. The jurisdiction radio's change handler nulls the pathway radio's
 *     members — a written pathway value is destructible by one ordinary click.
 *  5. `ESTAR_TEMPLATE_RECOMPUTED_FIELDS` matches the template exactly: for each
 *     of the twenty mapped fields, the set of scripts that assign its
 *     `rawValue`, re-enumerated across all 1,435 script bodies.
 *
 * WHAT IT DOES NOT PIN: Acrobat. Acrobat is not available in this environment.
 * These are assertions about what the template DECLARES; the inference from
 * "only a `change` handler reveals it" to "Acrobat will not reveal it on open"
 * rests on XFA event semantics and on FDA's own comment in
 * `DDDropDownList513 [exit]` that `getFocus()` is null when nothing is focused.
 * See `docs/reports/estar-acrobat-behaviour-2026-09-04.md`.
 *
 * Skipped, never faked, when the template is not vendored.
 *
 * @module server/services/pathway-engines/estar/__tests__/estar-field-map.template-behaviour.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { listXfaPackets } from '../../../forms/fill-official-pdf';
import { ESTAR_FIELD_MAPS, ESTAR_TEMPLATE_RECOMPUTED_FIELDS } from '../estar-field-map';

const NIVD_TEMPLATE = path.resolve(
  process.env.ESTAR_TEMPLATE_DIR || path.resolve(process.cwd(), 'assets/estar-templates'),
  'eSTAR-510k-non-ivd.pdf',
);
const hasTemplate = fsSync.existsSync(NIVD_TEMPLATE);

/** The container subforms and hidden fields that stand between our data and a page. */
const HIDDEN_CONTAINERS = [
  'AdministrativeInformation',
  'ApplicantInformation',
  'CorrespondentInformation',
  'AdministrativeDocumentation',
  'PMNSummary',
  'DoC',
  'Classification',
  'USAKnownClassification',
  'PredicatesSE',
  'PredicateReference',
  'Labeling',
  'SpecificLabeling',
];

/** Activities that fire without a user: if a reveal hung off one, a write would work. */
const ON_OPEN_ACTIVITIES = ['initialize', 'docReady', 'ready'];

/** Canonical key → the leaf field name of its mapped SOM path, for the 510(k) map. */
const MAPPED_LEAF: Record<string, string> = Object.fromEntries(
  Object.entries(ESTAR_FIELD_MAPS['510k-device']).map(([key, spec]) => [
    key,
    String(spec.xfaSomPath).split('.').pop()!,
  ]),
);

// ---------------------------------------------------------------------------
// Blank the script/exData bodies, then index the event graph
// ---------------------------------------------------------------------------

interface ScriptBody {
  index: number;
  tag: 'script' | 'exData';
  body: string;
}

interface OwnedScript {
  /** Dotted SOM path of the nearest enclosing named container. */
  som: string;
  /** `change` / `exit` / `click` / … for an event script; `variables` / `validate` otherwise. */
  activity: string;
  /** `event` | `variables` | `validate` | `calculate` — the script element's parent. */
  parent: string;
  body: string;
}

interface TemplateIndex {
  blanked: string;
  bodies: ScriptBody[];
  scripts: OwnedScript[];
  /** Count of `<event activity="X">` elements, by activity. */
  eventActivityCounts: Record<string, number>;
  refFormEventCount: number;
}

/** Replace every `<script>`/`<exData>` body with a token. Closing tags in this
 *  template are emitted as `</script\n>`, so the newline before `>` is matched. */
function blankBodies(xml: string): { blanked: string; bodies: ScriptBody[] } {
  const bodies: ScriptBody[] = [];
  const blanked = xml.replace(
    /(<(script|exData)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/g,
    (_m, open: string, tag: string, body: string, close: string) => {
      const index = bodies.length;
      bodies.push({ index, tag: tag as 'script' | 'exData', body });
      return `${open}@@BODY${index}@@${close}`;
    },
  );
  return { blanked, bodies };
}

const NAMED = new Set(['subform', 'field', 'exclGroup', 'subformSet', 'area', 'draw']);
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)\s*>/g;

function attrOf(attrs: string, key: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : undefined;
}

/** Attribute the `<script>` at `offset` to its owning node and activity. */
function ownScript(
  at: { blanked: string; offset: number; bodies: ScriptBody[] },
  som: string,
  parentTag: string | undefined,
  currentEventActivity: string | null,
): OwnedScript {
  const token = at.blanked.slice(at.offset, at.offset + 400).match(/@@BODY(\d+)@@/);
  const parent = parentTag ?? '(root)';
  return {
    som,
    activity: parent === 'event' ? (currentEventActivity ?? '(none)') : parent,
    parent,
    body: token ? at.bodies[Number(token[1])].body : '',
  };
}

function indexTemplate(templateXml: string): TemplateIndex {
  const { blanked, bodies } = blankBodies(templateXml);
  const stack: { tag: string; name?: string }[] = [];
  const somPath = () =>
    stack
      .filter((s) => NAMED.has(s.tag) && s.name)
      .map((s) => s.name)
      .join('.');

  const scripts: OwnedScript[] = [];
  const eventActivityCounts: Record<string, number> = {};
  let refFormEventCount = 0;
  let currentEventActivity: string | null = null;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(blanked)) !== null) {
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) {
      if (tag === 'event') currentEventActivity = null;
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    const isSelfClosing = Boolean(selfClose);
    if (tag === 'event') {
      const activity = attrOf(attrs, 'activity') ?? '(none)';
      eventActivityCounts[activity] = (eventActivityCounts[activity] ?? 0) + 1;
      if (attrOf(attrs, 'ref') === '$form') refFormEventCount += 1;
      currentEventActivity = activity;
    } else if (tag === 'script') {
      scripts.push(
        ownScript(
          { blanked, offset: m.index, bodies },
          somPath(),
          stack[stack.length - 1]?.tag,
          currentEventActivity,
        ),
      );
    }
    if (isSelfClosing) continue;
    stack.push(tag === 'event' || tag === 'script' ? { tag } : { tag, name: attrOf(attrs, 'name') });
  }

  return { blanked, bodies, scripts, eventActivityCounts, refFormEventCount };
}

// ---------------------------------------------------------------------------

const d = hasTemplate ? describe : describe.skip;

d('FDA eSTAR template — the script facts the field map depends on', () => {
  let idx: TemplateIndex;

  beforeAll(async () => {
    const bytes = await fs.readFile(NIVD_TEMPLATE);
    const packets = await listXfaPackets(bytes);
    const template = packets.find((p) => p.name === 'template');
    expect(template, 'template packet must be present').toBeTruthy();
    idx = indexTemplate(Buffer.from(template!.bytes).toString('utf8'));
  }, 120_000);

  it('blanks every script/exData body before scanning, and that changes the parse', () => {
    // The guard this file exists to honour: JavaScript bodies forge tags.
    const rawElements = (idx.blanked.match(/@@BODY\d+@@/g) ?? []).length;
    expect(idx.bodies.filter((b) => b.tag === 'script').length).toBeGreaterThan(1_400);
    expect(idx.bodies.filter((b) => b.tag === 'exData').length).toBeGreaterThan(400);
    expect(rawElements).toBe(idx.bodies.length);
    // Nothing survives that could be mistaken for markup inside a body.
    expect(idx.blanked).not.toContain('xfa.host.getFocus');
  });

  it('declares exactly one initialize event, and it reveals nothing', () => {
    expect(idx.eventActivityCounts.initialize).toBe(1);
    expect(idx.refFormEventCount).toBe(0);
    const initialize = idx.scripts.filter((s) => s.activity === 'initialize');
    expect(initialize).toHaveLength(1);
    expect(initialize[0].som).toBe('root');
    expect(initialize[0].body).not.toMatch(/presence\s*=\s*"visible"/);
    expect(initialize[0].body).not.toContain('execEvent');
  });

  it('reveals every mapped container only from a user-interaction activity', () => {
    const revealActivities = new Map<string, Set<string>>();
    for (const container of HIDDEN_CONTAINERS) {
      const direct = new RegExp(
        `(?:^|[^A-Za-z0-9_])${container}(?:\\[[^\\]]*\\])?\\s*\\.presence\\s*=\\s*"visible"`,
      );
      const viaResolve = new RegExp(
        `resolveNode\\([^)]*${container}[^)]*\\)\\s*\\.presence\\s*=\\s*"visible"`,
      );
      const activities = new Set(
        idx.scripts.filter((s) => direct.test(s.body) || viaResolve.test(s.body)).map((s) => s.activity),
      );
      revealActivities.set(container, activities);
    }
    // Every container is revealed by at least one script somewhere…
    const unrevealed = [...revealActivities].filter(([, a]) => a.size === 0).map(([c]) => c);
    expect(unrevealed).toEqual(['PredicateReference']); // revealed via a computed resolveNode index
    // …and NONE of those scripts hangs off an activity that fires without a user.
    const onOpenReveals = [...revealActivities].flatMap(([container, activities]) =>
      [...activities].filter((a) => ON_OPEN_ACTIVITIES.includes(a)).map((a) => `${container}:${a}`),
    );
    expect(onOpenReveals).toEqual([]);
  });

  it('guards the 510(k) reveal on an unconditional xfa.host.getFocus() dereference', () => {
    const pathwayChange = idx.scripts.filter(
      (s) => s.som === 'root.ApplicationType.USA.ATRadioButton110' && s.activity === 'change',
    );
    expect(pathwayChange).toHaveLength(1);
    const body = pathwayChange[0].body;
    // The template's own text, verbatim (its `&&` is XML-escaped in the packet).
    expect(body).toContain(
      'if (xfa.host.getFocus().name.substr(0,15) != "ATRadioButton10" &amp;&amp; ApplicationType.ATRadioButton100.rawValue == 1)',
    );
    // …and it is that block, not another, that reveals the 510(k)-only sections.
    expect(body).toContain('Classification.presence = "visible";');
    expect(body).toContain('Classification.USAKnownClassification.presence = "visible";');
    expect(body).toContain('PredicatesSE.presence = "visible";');
  });

  it('lets one jurisdiction click null the pathway radio members', () => {
    const jurisdictionChange = idx.scripts.filter(
      (s) => s.som === 'root.ApplicationType.ATRadioButton100' && s.activity === 'change',
    );
    expect(jurisdictionChange).toHaveLength(1);
    const body = jurisdictionChange[0].body;
    expect(body).toContain('if (xfa.host.getFocus().name != "ImportData")');
    for (const member of ['ATRadioButton111', 'ATRadioButton112', 'ATRadioButton113']) {
      expect(body).toContain(`this.USA.ATRadioButton110.${member}.rawValue = null;`);
    }
  });

});

d('FDA eSTAR template — the fields the form recomputes for itself', () => {
  let idx: TemplateIndex;

  beforeAll(async () => {
    const bytes = await fs.readFile(NIVD_TEMPLATE);
    const packets = await listXfaPackets(bytes);
    const template = packets.find((p) => p.name === 'template');
    expect(template, 'template packet must be present').toBeTruthy();
    idx = indexTemplate(Buffer.from(template!.bytes).toString('utf8'));
  }, 120_000);

  it('matches ESTAR_TEMPLATE_RECOMPUTED_FIELDS to the scripts that assign each field', () => {
    const label = (s: OwnedScript) =>
      s.parent === 'event' ? `${s.som} [${s.activity}]` : `${s.som} <${s.parent}>`;

    const measured: Record<string, string[]> = {};
    for (const [key, leaf] of Object.entries(MAPPED_LEAF)) {
      const assigns = new RegExp(`\\b${leaf}(?:\\[[^\\]]*\\])?\\s*\\.rawValue\\s*=(?!=)`);
      measured[key] = idx.scripts.filter((s) => assigns.test(s.body)).map(label);
    }

    const declared = Object.fromEntries(
      Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS).map(([k, v]) => [k, [...v.writtenBy]]),
    );
    expect(measured).toEqual(declared);

    // The four the pathway click itself clears, and the six nothing ever touches.
    const clearedByClick = Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS)
      .filter(([, v]) => v.clearedByPathwayClick)
      .map(([k]) => k)
      .sort();
    expect(clearedByClick).toEqual([
      'declarationDeviceTradeName',
      'deviceClassificationName',
      'deviceTradeName',
      'productCodes',
    ]);
    const durable = Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS)
      .filter(([, v]) => v.writtenBy.length === 0)
      .map(([k]) => k)
      .sort();
    expect(durable).toEqual([
      'applicantCompanyName',
      'applicantContactEmail',
      'associatedProductCodes',
      'correspondentCompanyName',
      'correspondentContactEmail',
      'indicationsForUseCitation',
    ]);
  });

  it('proves the pathway click runs the two scripts that clear those four fields', () => {
    const pathwayChange = idx.scripts.find(
      (s) => s.som === 'root.ApplicationType.USA.ATRadioButton110' && s.activity === 'change',
    )!;
    expect(pathwayChange.body).toContain(
      'Classification.USAKnownClassification.DDDropDownList517.execEvent("exit");',
    );
    expect(pathwayChange.body).toContain('DeviceDescription.Devices.Functions.Validation();');

    const dropdown517Exit = idx.scripts.find(
      (s) =>
        s.som === 'root.Classification.USAKnownClassification.DDDropDownList517' && s.activity === 'exit',
    )!;
    expect(dropdown517Exit.body).toContain(
      'AdministrativeDocumentation.PMNSummary.SSTextField260.rawValue = "";',
    );
    expect(dropdown517Exit.body).toContain(
      'AdministrativeDocumentation.PMNSummary.SSTextField240.rawValue = "";',
    );

    const devicesVariables = idx.scripts.find(
      (s) => s.som === 'root.DeviceDescription.Devices' && s.parent === 'variables',
    )!;
    expect(devicesVariables.body).toContain(
      'AdministrativeDocumentation.DoC.DCTextField140.rawValue = "";',
    );
    expect(devicesVariables.body).toContain(
      'AdministrativeDocumentation.PMNSummary.SSTextField220.rawValue = "";',
    );
  });
});

describe('eSTAR field maps — the pathway declaration stays the applicant’s', () => {
  it('maps no key onto the ApplicationType selectors', () => {
    for (const [descriptor, map] of Object.entries(ESTAR_FIELD_MAPS)) {
      for (const [key, spec] of Object.entries(map)) {
        for (const som of [spec.xfaSomPath, ...(spec.alsoWriteSomPaths ?? [])]) {
          expect(
            String(som ?? ''),
            `${descriptor}.${key} must not write the applicant's pathway declaration`,
          ).not.toMatch(/^root\.ApplicationType\b/);
        }
      }
    }
  });

  it('declares a recomputation record for every 510(k) device key', () => {
    expect(Object.keys(ESTAR_TEMPLATE_RECOMPUTED_FIELDS).sort()).toEqual(
      Object.keys(ESTAR_FIELD_MAPS['510k-device']).sort(),
    );
  });
});

/**
 * `rebuildOutcome` is the field map's claim about what happens to each summary
 * cell when the template's own script rebuilds it. The claim is checkable
 * without Acrobat, because it reduces to one question about the map itself: is
 * the SOURCE the rebuild reads written by this map, and with what?
 *
 *   'reproduces'  — the source is written, and with the same governed fact.
 *   'blanks'      — the source is not written by anything, so the rebuild
 *                   produces an empty string.
 *   'substitutes' — the source IS written, but by a key carrying a DIFFERENT
 *                   governed fact, so the rebuild replaces our value with that
 *                   one. Blank is a gap; this is a wrong value, and it is the
 *                   case that must never be mislabelled as either of the others.
 *
 * These run without the template: they are a consistency check between two
 * declarations in the same file, and the template-derived half — which script
 * assigns which cell, and from where — is pinned above.
 */
describe('eSTAR field maps — every recompute claim matches what the map actually writes', () => {
  const MAP = ESTAR_FIELD_MAPS['510k-device'];
  /** Every XFA node this map writes, from the primary path and the further ones. */
  const WRITTEN: Map<string, string[]> = new Map();
  for (const [key, spec] of Object.entries(MAP)) {
    for (const som of [spec.xfaSomPath, ...(spec.alsoWriteSomPaths ?? [])]) {
      if (!som) continue;
      WRITTEN.set(som, [...(WRITTEN.get(som) ?? []), key]);
    }
  }
  /* `rebuiltFrom` names a repeat as `Device[].TradeName`; the map writes the
     single shipped instance as `Device.TradeName`. Compare on the same shape. */
  const norm = (som: string) => som.replace(/\[\]/g, '');

  it('a field claiming the rebuild REPRODUCES its value has that source written', () => {
    for (const [key, rec] of Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS)) {
      if (rec.rebuildOutcome !== 'reproduces' || !rec.rebuiltFrom) continue;
      const writers = WRITTEN.get(norm(rec.rebuiltFrom));
      expect(
        writers,
        `${key} claims the rebuild reproduces its value, so the map must write ${rec.rebuiltFrom}`,
      ).toBeTruthy();
    }
  });

  it('a field claiming the rebuild BLANKS it has that source written by nobody', () => {
    for (const [key, rec] of Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS)) {
      if (rec.rebuildOutcome !== 'blanks' || !rec.rebuiltFrom) continue;
      /* deviceClassificationName is the deliberate exception and says so in its
         own note: the source IS written, with a bare product code too short for
         the substr the rebuild guards on. Everything else must be unwritten. */
      if (key === 'deviceClassificationName') continue;
      expect(
        WRITTEN.get(norm(rec.rebuiltFrom)) ?? null,
        `${key} claims the rebuild blanks it, so nothing may write ${rec.rebuiltFrom}`,
      ).toBeNull();
    }
  });

  it('names the one cell the form fills from a DIFFERENT governed fact', () => {
    /* The Declaration of Conformity company name. FDA rebuilds DCTextField120
       from the APPLICANT company field, which this map writes from a different
       column, so a filing that names a separate declaring entity loses it the
       moment the applicant tabs through their own block. It is recorded, not
       silently carried as if it were safe. */
    const substituting = Object.entries(ESTAR_TEMPLATE_RECOMPUTED_FIELDS)
      .filter(([, r]) => r.rebuildOutcome === 'substitutes')
      .map(([k]) => k);
    expect(substituting).toEqual(['declarationCompanyName']);
    const rec = ESTAR_TEMPLATE_RECOMPUTED_FIELDS.declarationCompanyName;
    expect(WRITTEN.get(norm(rec.rebuiltFrom!))).toEqual(['applicantCompanyName']);
    expect(rec.note).toMatch(/different/i);
  });

  it('writes the two sources that turn the reveal click from destructive into constructive', () => {
    /* Before these, the applicant's first click erased four governed values.
       These two paths are what the click now rebuilds them from. */
    expect(WRITTEN.get('root.DeviceDescription.Devices.Device.TradeName')).toEqual([
      'declarationDeviceTradeName',
    ]);
    expect(WRITTEN.get('root.Classification.USAKnownClassification.DDDropDownList517')).toEqual([
      'productCodes',
    ]);
    /* Both shared maps carry the trade-name source, so it reaches De Novo and
       PMA as well — the script that clears the cell is in the pathway handler's
       COMMON tail, not its 510(k) branch. */
    for (const descriptor of ['de_novo-device', 'pma-device', 'de_novo-ivd', 'pma-ivd']) {
      expect(
        ESTAR_FIELD_MAPS[descriptor].declarationDeviceTradeName.alsoWriteSomPaths,
        `${descriptor} must write the device listing row`,
      ).toEqual(['root.DeviceDescription.Devices.Device.TradeName']);
    }
  });
});
