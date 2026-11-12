/**
 * What ICH Q6A or Q6B expects in a specification, beside the specifications register (P-122 inventory, row B5;
 * 2026-11-12). Split out of the CMC registers' files, which stand at the repository's size ceilings.
 *
 * The reference has existed since the Global RI capability catalog was written
 * (server/services/global-ri/cmc-specifications.ts, GET /api/global-ri/cmc/specifications/:productType): the tests
 * a specification is expected to carry, universal and by dosage form. No CMC screen showed it, and production
 * refused the path because only the locked Global RI screen claimed it.
 *
 * It is a reference, shown as one. It does not say which of these tests the project's own specifications carry: a
 * specification's attribute is free text, so a "missing" verdict would be a string match, and a wrong one would be
 * read as a finding. The person compares; the engine's own caveat (no numeric limits; criteria are justified case
 * by case) is printed under the list.
 *
 * @module client/src/concept2cure/v2/surfaces/cmcSpecReference
 */
import * as React from 'react';
import { I } from '../icons';
import { EmptyState, readRefusalWords, useLiveData } from '../dataConnect';
import { readShellProject } from '../shellProject';

type ProductType = 'small_molecule' | 'biologic';
/** '' is the substance or a product of no listed form: the universal tests alone. */
type DosageForm = '' | 'solid_oral' | 'oral_liquid' | 'parenteral';

interface SpecTest { id: string; title: string; citation: string }
interface SpecReference {
  productType: ProductType;
  dosageForm: string | null;
  universalTests: SpecTest[];
  dosageFormTests: SpecTest[];
  citation: string;
  notes: string[];
}

const PRODUCT_TYPES: { id: ProductType; label: string }[] = [
  { id: 'small_molecule', label: 'Small molecule (ICH Q6A)' },
  { id: 'biologic', label: 'Biologic (ICH Q6B)' },
];
/* ICH Q6A gives form-specific tests for these three; for a biologic the engine recognises the parenteral form only
   (cmc-specifications.ts), so the other two are not offered there. */
const DOSAGE_FORMS: { id: DosageForm; label: string; biologic: boolean }[] = [
  { id: '', label: 'Any form', biologic: true },
  { id: 'solid_oral', label: 'Solid oral', biologic: false },
  { id: 'oral_liquid', label: 'Oral liquid', biologic: false },
  { id: 'parenteral', label: 'Parenteral', biologic: true },
];

const isTest = (v: unknown): v is SpecTest =>
  typeof v === 'object' && v !== null && typeof (v as SpecTest).id === 'string' && typeof (v as SpecTest).title === 'string';
/** The reference as the route returns it, or nothing: a reply of another shape is a failed read, not an empty list. */
function isReference(v: unknown): v is SpecReference {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<SpecReference>;
  return Array.isArray(r.universalTests) && r.universalTests.every(isTest)
    && Array.isArray(r.dosageFormTests) && r.dosageFormTests.every(isTest)
    && typeof r.citation === 'string' && Array.isArray(r.notes);
}

/**
 * The guideline the card opens on: the project's own, when the shell knows its product type. It does not always: a
 * project opened by a link carries its id alone until its page has loaded (shellProject.ts), and on 2026-11-12, in
 * the running app, a biologic opened that way was shown ICH Q6A. An unknown type is not guessed: nothing is
 * preselected and the person chooses.
 */
function startingType(): ProductType | null {
  const declared = String(readShellProject()?.productType ?? '').trim().toLowerCase();
  if (declared === 'biologic') return 'biologic';
  return declared === 'drug' ? 'small_molecule' : null;
}

function Choice<T extends string>({ label, options, value, onChange }: {
  label: string; options: { id: T; label: string }[]; value: T | null; onChange: (id: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id || 'any'} type="button" className="seg-b" aria-pressed={value === o.id}
          data-on={value === o.id || undefined} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tests({ title, tests }: { title: string; tests: SpecTest[] }) {
  const id = React.useId();
  return (
    <div>
      <div className="sec-sub" id={id}>{title}</div>
      <ul aria-labelledby={id} style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
        {tests.map((t) => <li key={t.id}>{t.title}</li>)}
      </ul>
    </div>
  );
}

const GUIDELINE: Record<ProductType, string> = { small_molecule: 'ICH Q6A', biologic: 'ICH Q6B' };

/** The route for a guideline and a dosage form. */
const referencePath = (productType: ProductType, dosageForm: DosageForm) =>
  `/api/global-ri/cmc/specifications/${productType}${dosageForm ? `?dosageForm=${dosageForm}` : ''}`;

/** The reference once a guideline is chosen: loading, a failed or refused read said as one, or the tests. */
function ReferenceTests({ productType, dosageForm, formLabel }: { productType: ProductType; dosageForm: DosageForm; formLabel: string }) {
  const path = referencePath(productType, dosageForm);
  const read = useLiveData<SpecReference>(path, [path], isReference);
  if (read.loading) return <EmptyState icon={I.clipboardList} title="Loading the reference…" busy />;
  if (read.error || !read.data) {
    const refused = read.error ? readRefusalWords(read, 'the reference') : null;
    return (
      <EmptyState tone="error" icon={I.alertTriangle}
        title={refused?.title ?? `Couldn’t load the ${GUIDELINE[productType]} reference`}
        hint={refused?.message ?? 'The reference test set did not load, so none is shown. Try again.'} />
    );
  }
  return (
    <>
      <Tests title="In every specification" tests={read.data.universalTests} />
      {read.data.dosageFormTests.length > 0 && <Tests title={`Also for a ${formLabel} product`} tests={read.data.dosageFormTests} />}
      {read.data.notes.map((n) => <p key={n} className="sec-sub">{n}</p>)}
    </>
  );
}

export function CmSpecReference() {
  const [productType, setProductType] = React.useState<ProductType | null>(startingType);
  const [form, setForm] = React.useState<DosageForm>('');
  const forms = DOSAGE_FORMS.filter((f) => productType !== 'biologic' || f.biologic);
  // A form the other guideline does not list is not carried across the switch.
  const dosageForm = forms.some((f) => f.id === form) ? form : '';
  const formLabel = (forms.find((f) => f.id === dosageForm)?.label ?? '').toLowerCase();

  return (
    <div className="pj-card" data-testid="cm-spec-reference" style={{ margin: '14px 0' }}>
      <div className="pj-card-h">
        <span className="t">What {productType ? GUIDELINE[productType] : 'ICH Q6A or Q6B'} expects in a specification</span>
        <span className="s">a reference, not a check of the specifications above</span>
      </div>
      <div className="pj-card-b">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Choice label="Guideline" options={PRODUCT_TYPES} value={productType} onChange={setProductType} />
          {productType && <Choice label="Dosage form" options={forms} value={dosageForm} onChange={setForm} />}
        </div>
        {/* Nothing is read until a guideline is chosen. */}
        {productType === null ? (
          <p className="sec-sub" data-testid="cm-spec-reference-choose">
            Choose the guideline for this product: ICH Q6A for a chemical substance or product, ICH Q6B for a
            biotechnological or biological one. This project's product type is not known here, so none is chosen for you.
          </p>
        ) : (
          <ReferenceTests productType={productType} dosageForm={dosageForm} formLabel={formLabel} />
        )}
      </div>
    </div>
  );
}
